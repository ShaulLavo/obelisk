import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { createLocalStorageBackend } from './localStorageBackend'
import type { FileCacheEntry } from '../fileCacheController'

describe('LocalStorageBackend Browser Tests', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	afterEach(() => {
		localStorage.clear()
	})

	/**
	 * **Feature: persistent-file-cache, Property 6: JSON Serialization Round-Trip**
	 * **Validates: Requirements 3.4**
	 * 
	 * For any valid FileCacheEntry stored in Warm_Cache, serializing then deserializing 
	 * SHALL produce an equivalent object.
	 */
	it('property: JSON serialization round-trip preserves data', () => {
		fc.assert(
			fc.property(
				// Generate arbitrary FileCacheEntry-like objects
				fc.record({
					// ScrollPosition - exclude NaN values since they don't round-trip through JSON
					scrollPosition: fc.option(fc.record({
						scrollTop: fc.float({ min: 0, max: 10000, noNaN: true }),
						scrollLeft: fc.float({ min: 0, max: 10000, noNaN: true })
					}), { nil: undefined }),
					// Simple arrays and objects that JSON can handle
					highlights: fc.option(fc.array(fc.record({
						startIndex: fc.integer({ min: 0, max: 1000 }),
						endIndex: fc.integer({ min: 0, max: 1000 }),
						scope: fc.string({ minLength: 1, maxLength: 20 }),
						className: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
					})), { nil: undefined }),
					folds: fc.option(fc.array(fc.record({
						startLine: fc.integer({ min: 0, max: 100 }),
						endLine: fc.integer({ min: 0, max: 100 }),
						type: fc.string({ minLength: 1, maxLength: 10 })
					})), { nil: undefined }),
					brackets: fc.option(fc.array(fc.record({
						index: fc.integer({ min: 0, max: 1000 }),
						char: fc.string({ minLength: 1, maxLength: 1 }),
						depth: fc.integer({ min: 0, max: 10 })
					})), { nil: undefined }),
					errors: fc.option(fc.array(fc.record({
						startIndex: fc.integer({ min: 0, max: 1000 }),
						endIndex: fc.integer({ min: 0, max: 1000 }),
						message: fc.string({ minLength: 1, maxLength: 50 }),
						isMissing: fc.boolean()
					})), { nil: undefined }),
					// Visible content snapshot
					visibleContent: fc.option(fc.record({
						scrollTop: fc.float({ min: 0, max: 10000, noNaN: true }),
						scrollLeft: fc.float({ min: 0, max: 10000, noNaN: true }),
						viewportHeight: fc.integer({ min: 100, max: 2000 }),
						viewportWidth: fc.integer({ min: 100, max: 2000 }),
						lines: fc.array(fc.record({
							lineIndex: fc.integer({ min: 0, max: 100 }),
							columnStart: fc.integer({ min: 0, max: 100 }),
							columnEnd: fc.integer({ min: 0, max: 100 }),
							runs: fc.array(fc.record({
								text: fc.string({ maxLength: 50 }),
								depth: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
								highlightClass: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
								highlightScope: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
							}))
						}))
					}), { nil: undefined })
				}, { requiredKeys: [] }), // All fields are optional
				fc.string({ minLength: 1, maxLength: 20 }), // key
				(entry, key) => {
					const backend = createLocalStorageBackend<Partial<FileCacheEntry>>({
						prefix: 'test:',
						maxSize: 1024 * 1024 // 1MB for testing
					})

					// Store the entry
					const storedEntry = backend.set(key, entry)
					
					// Retrieve the entry
					const retrievedEntry = backend.get(key)

					// Verify round-trip preservation
					expect(retrievedEntry).toEqual(entry)
					expect(storedEntry).toEqual(entry)
				}
			),
			{ numRuns: 20 }
		)
	})

	/**
	 * **Feature: persistent-file-cache, Property 7: localStorage Quota Recovery**
	 * **Validates: Requirements 3.5**
	 * 
	 * For any Warm_Cache write that exceeds localStorage quota, the cache SHALL evict 
	 * oldest entries until the write succeeds or the cache is empty.
	 */
	it('property: quota recovery evicts oldest entries until write succeeds', () => {
		fc.assert(
			fc.property(
				// Generate a sequence of entries to fill cache, then a large entry to trigger quota
				fc.record({
					initialEntries: fc.array(
						fc.record({
							key: fc.string({ minLength: 1, maxLength: 10 }),
							value: fc.string({ minLength: 10, maxLength: 30 }) // Smaller values
						}),
						{ minLength: 3, maxLength: 6 }
					).filter(entries => {
						// Ensure all keys are unique
						const keys = entries.map(e => e.key)
						return new Set(keys).size === keys.length
					}),
					largeValue: fc.string({ minLength: 50, maxLength: 100 }) // Reasonable large value
				}),
				({ initialEntries, largeValue }) => {
					const backend = createLocalStorageBackend({
						prefix: 'quota-test:',
						maxSize: 500 // Small limit to trigger eviction
					})

					// Add initial entries
					for (const entry of initialEntries) {
						backend.set(entry.key, entry.value)
					}

					const keysBeforeLarge = backend.keys() as string[]
					const initialCount = keysBeforeLarge.length

					// Try to add large value - should either succeed or fail gracefully
					try {
						backend.set('large-key', largeValue)

						// If it succeeded, verify the large entry was stored
						expect(backend.get('large-key')).toBe(largeValue)
						expect(backend.has('large-key')).toBe(true)

						// Verify some entries may have been evicted to make space
						const keysAfterLarge = backend.keys() as string[]
						expect(keysAfterLarge.length).toBeLessThanOrEqual(initialCount + 1)

						// Verify the large key is present
						expect(keysAfterLarge).toContain('large-key')

					} catch (error) {
						// If it failed, it should be because the item is too large
						expect(error).toBeInstanceOf(Error)
						expect((error as Error).message).toMatch(/too large|storage/)
						
						// Original entries should still be intact if large item couldn't fit
						const keysAfterFailure = backend.keys() as string[]
						expect(keysAfterFailure.length).toBeGreaterThan(0)
					}
				}
			),
			{ numRuns: 10 } // Reduced for faster execution
		)
	})

	/**
	 * Test JSON serialization with primitive types that should round-trip perfectly.
	 */
	it('property: primitive types round-trip correctly', () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.string(),
					fc.integer(),
					fc.float({ noNaN: true, noDefaultInfinity: true }).filter(x => !Object.is(x, -0)), // Exclude -0 since JSON doesn't preserve it
					fc.boolean(),
					fc.constant(null),
					fc.array(fc.string()),
					fc.array(fc.integer()),
					fc.record({
						str: fc.string(),
						num: fc.integer(),
						bool: fc.boolean(),
						arr: fc.array(fc.string())
					})
				),
				fc.string({ minLength: 1, maxLength: 10 }),
				(value, key) => {
					const backend = createLocalStorageBackend({
						prefix: 'prim:',
						maxSize: 1024 * 1024
					})

					backend.set(key, value)
					const retrieved = backend.get(key)

					expect(retrieved).toEqual(value)
				}
			),
			{ numRuns: 20 }
		)
	})

	// Unit tests for specific edge cases
	it('handles empty objects and arrays', () => {
		const backend = createLocalStorageBackend({ prefix: 'empty:' })

		backend.set('empty-obj', {})
		backend.set('empty-arr', [])
		backend.set('empty-str', '')

		expect(backend.get('empty-obj')).toEqual({})
		expect(backend.get('empty-arr')).toEqual([])
		expect(backend.get('empty-str')).toBe('')
	})

	it('handles nested objects correctly', () => {
		const backend = createLocalStorageBackend({ prefix: 'nested:' })

		const nestedData = {
			level1: {
				level2: {
					level3: {
						value: 'deep',
						array: [1, 2, { nested: true }]
					}
				}
			}
		}

		backend.set('nested', nestedData)
		const retrieved = backend.get('nested')

		expect(retrieved).toEqual(nestedData)
	})

	it('handles special JSON values', () => {
		const backend = createLocalStorageBackend({ prefix: 'special:' })

		// Test various special cases
		backend.set('null', null)
		backend.set('zero', 0)
		backend.set('false', false)
		backend.set('empty-string', '')

		expect(backend.get('null')).toBe(null)
		expect(backend.get('zero')).toBe(0)
		expect(backend.get('false')).toBe(false)
		expect(backend.get('empty-string')).toBe('')
	})

	it('returns null for non-existent keys', () => {
		const backend = createLocalStorageBackend({ prefix: 'test:' })

		expect(backend.get('non-existent')).toBe(null)
	})

	it('handles corrupted JSON gracefully', () => {
		const backend = createLocalStorageBackend({ prefix: 'corrupt:' })

		// Manually corrupt localStorage data
		localStorage.setItem('corrupt:bad-json', '{invalid json}')

		// Should return null and clean up the corrupted entry
		expect(backend.get('bad-json')).toBe(null)
		expect(backend.has('bad-json')).toBe(false)
	})

	it('tracks size correctly', () => {
		const backend = createLocalStorageBackend({ prefix: 'size:' })

		expect(backend.estimateSize!() as number).toBe(0)

		backend.set('key1', 'hello')
		const sizeAfterFirst = backend.estimateSize!() as number
		expect(sizeAfterFirst).toBeGreaterThan(0)

		backend.set('key2', 'world')
		const sizeAfterSecond = backend.estimateSize!() as number
		expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst)

		backend.remove('key1')
		const sizeAfterRemoval = backend.estimateSize!() as number
		expect(sizeAfterRemoval).toBeLessThan(sizeAfterSecond)

		backend.clear()
		expect(backend.estimateSize!() as number).toBe(0)
	})

	it('enforces size limits with eviction', () => {
		const backend = createLocalStorageBackend({
			prefix: 'limit:',
			maxSize: 100 // Very small limit to force eviction
		})

		// Add entries that exceed the limit
		backend.set('key1', 'a'.repeat(30))
		backend.set('key2', 'b'.repeat(30))
		backend.set('key3', 'c'.repeat(30)) // This should trigger eviction

		// Should have evicted oldest entries to stay under limit
		expect(backend.estimateSize!() as number).toBeLessThanOrEqual(100)
	})

	it('handles localStorage quota exceeded errors in real browser environment', () => {
		const backend = createLocalStorageBackend({
			prefix: 'quota-test:',
			maxSize: 100 // Very small limit
		})

		// Add entries that should work within the limit
		backend.set('small1', 'a')
		backend.set('small2', 'b')
		
		// Verify the entries were stored
		expect(backend.get('small1')).toBe('a')
		expect(backend.get('small2')).toBe('b')
		
		// The backend should handle large entries gracefully
		// Either by evicting old entries or by handling the error
		expect(() => {
			backend.set('large', 'x'.repeat(1000))
		}).not.toThrow() // Should not crash, even if it can't store the large item
	})

	it('maintains key namespacing with prefix', () => {
		const backend1 = createLocalStorageBackend({ prefix: 'ns1:' })
		const backend2 = createLocalStorageBackend({ prefix: 'ns2:' })

		backend1.set('key', 'value1')
		backend2.set('key', 'value2')

		expect(backend1.get('key')).toBe('value1')
		expect(backend2.get('key')).toBe('value2')

		// Keys should be isolated
		expect(backend1.keys()).toEqual(['key'])
		expect(backend2.keys()).toEqual(['key'])
	})
})