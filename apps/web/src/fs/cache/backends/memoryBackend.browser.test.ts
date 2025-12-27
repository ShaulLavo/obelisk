import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { createMemoryBackend } from './memoryBackend'

describe('MemoryBackend Browser Tests', () => {
	/**
	 * **Feature: persistent-file-cache, Property 3: LRU Eviction Order**
	 * **Validates: Requirements 2.2, 2.5**
	 * 
	 * For any sequence of cache accesses in the Hot_Cache, when eviction occurs, 
	 * the entry with the oldest last-access timestamp SHALL be evicted first.
	 */
	it('property: LRU eviction order is maintained', () => {
		fc.assert(
			fc.property(
				// Generate a sequence of cache operations
				fc.record({
					maxEntries: fc.integer({ min: 2, max: 5 }), // Small cache for easier eviction testing
					keys: fc.array(
						fc.string({ minLength: 1, maxLength: 5 }),
						{ minLength: 3, maxLength: 10 }
					).filter(keys => {
						// Ensure all keys are unique
						return new Set(keys).size === keys.length
					})
				}),
				({ maxEntries, keys }) => {
					// Pre-condition: we need more keys than cache capacity to force eviction
					fc.pre(keys.length > maxEntries)

					const evictedEntries: Array<{ key: string; value: unknown }> = []
					
					// Create memory backend with eviction callback
					const backend = createMemoryBackend({
						maxEntries,
						onEvict: (key, value) => {
							evictedEntries.push({ key, value })
						}
					})

					// Add entries sequentially - this establishes the initial LRU order
					for (let i = 0; i < keys.length; i++) {
						const key = keys[i]
						if (key !== undefined) {
							backend.set(key, `value-${i}`)
						}
					}

					// Verify that evictions occurred (we added more than maxEntries)
					const expectedEvictions = keys.length - maxEntries
					expect(evictedEntries.length).toBe(expectedEvictions)

					// Verify that the first entries added were evicted (LRU behavior)
					// The first `expectedEvictions` keys should have been evicted
					const expectedEvictedKeys = keys.slice(0, expectedEvictions)
					const actualEvictedKeys = evictedEntries.map(e => e.key)
					
					expect(actualEvictedKeys).toEqual(expectedEvictedKeys)

					// Verify that the last `maxEntries` keys are still in cache
					const expectedRemainingKeys = keys.slice(-maxEntries)
					for (const key of expectedRemainingKeys) {
						expect(backend.has(key)).toBe(true)
					}

					// Verify cache size constraint is maintained
					const cacheKeys = backend.keys()
					const keysArray = Array.isArray(cacheKeys) ? cacheKeys : []
					expect(keysArray.length).toBe(maxEntries)
				}
			),
			{ numRuns: 20 }
		)
	})

	/**
	 * **Feature: persistent-file-cache, Property: Access updates LRU order**
	 * 
	 * For any key that exists in the cache, accessing it should move it to 
	 * the most recently used position, making it the last to be evicted.
	 */
	it('property: accessing entries updates LRU order', () => {
		fc.assert(
			fc.property(
				fc.record({
					keys: fc.array(
						fc.string({ minLength: 1, maxLength: 5 }),
						{ minLength: 4, maxLength: 4 } // Exactly 4 keys
					).filter(keys => {
						// Ensure all keys are unique
						return new Set(keys).size === keys.length
					}),
					accessIndex: fc.integer({ min: 0, max: 1 }) // Access one of the first 2 keys
				}),
				({ keys, accessIndex }) => {
					const maxEntries = 3 // Cache holds 3, we'll add 4 to force eviction
					const evictedEntries: Array<{ key: string; value: unknown }> = []
					
					const backend = createMemoryBackend({
						maxEntries,
						onEvict: (key, value) => {
							evictedEntries.push({ key, value })
						}
					})

					// Add first 3 entries (fill cache)
					for (let i = 0; i < 3; i++) {
						const key = keys[i]
						if (key !== undefined) {
							backend.set(key, `value-${i}`)
						}
					}

					// Access one of the first 2 entries to move it to front
					const accessedKey = keys[accessIndex]
					if (accessedKey !== undefined) {
						backend.get(accessedKey)
					}

					// Add 4th entry - this should evict the LRU entry
					const fourthKey = keys[3]
					if (fourthKey !== undefined) {
						backend.set(fourthKey, 'value-3')
					}

					// Verify exactly one eviction occurred
					expect(evictedEntries.length).toBe(1)

					// The accessed key should NOT be evicted (it was moved to front)
					const evictedEntry = evictedEntries[0]
					if (evictedEntry && accessedKey !== undefined) {
						const evictedKey = evictedEntry.key
						expect(evictedKey).not.toBe(accessedKey)
						
						// The accessed key should still be in the cache
						expect(backend.has(accessedKey)).toBe(true)

						// The evicted key should be one of the non-accessed keys from the first 2
						const nonAccessedKey = keys[1 - accessIndex] // The other key from first 2
						expect(evictedKey).toBe(nonAccessedKey)
					}
				}
			),
			{ numRuns: 20 }
		)
	})

	// Unit tests for specific edge cases
	it('evicts LRU entry when cache is full', () => {
		const evictedEntries: Array<{ key: string; value: unknown }> = []
		const backend = createMemoryBackend({
			maxEntries: 2,
			onEvict: (key, value) => {
				evictedEntries.push({ key, value })
			}
		})

		// Fill cache
		backend.set('key1', 'value1')
		backend.set('key2', 'value2')
		
		// This should evict key1 (oldest)
		backend.set('key3', 'value3')

		expect(evictedEntries).toHaveLength(1)
		const firstEvicted = evictedEntries[0]
		expect(firstEvicted?.key).toBe('key1')
		expect(firstEvicted?.value).toBe('value1')
		
		expect(backend.has('key1')).toBe(false)
		expect(backend.has('key2')).toBe(true)
		expect(backend.has('key3')).toBe(true)
	})

	it('updates existing entry without eviction', () => {
		const evictedEntries: Array<{ key: string; value: unknown }> = []
		const backend = createMemoryBackend({
			maxEntries: 2,
			onEvict: (key, value) => {
				evictedEntries.push({ key, value })
			}
		})

		backend.set('key1', 'value1')
		backend.set('key2', 'value2')
		
		// Update existing entry - should not cause eviction
		backend.set('key1', 'updated-value1')

		expect(evictedEntries).toHaveLength(0)
		expect(backend.get('key1')).toBe('updated-value1')
		expect(backend.get('key2')).toBe('value2')
	})

	it('accessing entry moves it to front of LRU', () => {
		const evictedEntries: Array<{ key: string; value: unknown }> = []
		const backend = createMemoryBackend({
			maxEntries: 2,
			onEvict: (key, value) => {
				evictedEntries.push({ key, value })
			}
		})

		backend.set('key1', 'value1')
		backend.set('key2', 'value2')
		
		// Access key1 to move it to front
		backend.get('key1')
		
		// Add key3 - should evict key2 (now LRU), not key1
		backend.set('key3', 'value3')

		expect(evictedEntries).toHaveLength(1)
		const firstEvicted = evictedEntries[0]
		expect(firstEvicted?.key).toBe('key2')
		
		expect(backend.has('key1')).toBe(true)
		expect(backend.has('key2')).toBe(false)
		expect(backend.has('key3')).toBe(true)
	})

	it('handles empty cache operations', () => {
		const backend = createMemoryBackend({ maxEntries: 5 })

		expect(backend.get('nonexistent')).toBe(null)
		expect(backend.has('nonexistent')).toBe(false)
		expect(backend.keys()).toEqual([])
		if (backend.estimateSize) {
			expect(backend.estimateSize()).toBe(0)
		}
		
		backend.remove('nonexistent') // Should not throw
		backend.clear() // Should not throw
	})

	it('tracks approximate size correctly', () => {
		const backend = createMemoryBackend({ maxEntries: 10 })

		if (!backend.estimateSize) {
			return // Skip test if estimateSize is not implemented
		}

		expect(backend.estimateSize()).toBe(0)

		backend.set('key1', 'hello')
		const sizeAfterFirst = backend.estimateSize() as number
		expect(sizeAfterFirst).toBeGreaterThan(0)

		backend.set('key2', 'world')
		const sizeAfterSecond = backend.estimateSize() as number
		expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst)

		backend.remove('key1')
		const sizeAfterRemoval = backend.estimateSize() as number
		expect(sizeAfterRemoval).toBeLessThan(sizeAfterSecond)

		backend.clear()
		expect(backend.estimateSize()).toBe(0)
	})

	it('handles different value types for size estimation', () => {
		const backend = createMemoryBackend({ maxEntries: 10 })

		if (!backend.estimateSize) {
			return // Skip test if estimateSize is not implemented
		}

		// String
		backend.set('str', 'hello')
		const strSize = backend.estimateSize() as number
		expect(strSize).toBeGreaterThan(0)

		// Number
		backend.set('num', 42)
		expect(backend.estimateSize() as number).toBeGreaterThan(strSize)

		// Array
		backend.set('arr', [1, 2, 3])
		expect(backend.estimateSize() as number).toBeGreaterThan(strSize)

		// Object
		backend.set('obj', { foo: 'bar' })
		expect(backend.estimateSize() as number).toBeGreaterThan(strSize)

		// Uint8Array
		backend.set('bytes', new Uint8Array([1, 2, 3, 4]))
		expect(backend.estimateSize() as number).toBeGreaterThan(strSize)
	})
})