import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { createIndexedDBBackend } from './indexedDBBackend'

// Mock IndexedDB for test environment
const mockIndexedDB = {
	open: vi.fn(),
	deleteDatabase: vi.fn(),
}

const mockIDBRequest = {
	onsuccess: null,
	onerror: null,
	result: null,
	error: null,
}

const mockIDBDatabase = {
	createObjectStore: vi.fn(),
	transaction: vi.fn(),
	close: vi.fn(),
}

const mockIDBTransaction = {
	objectStore: vi.fn(),
	oncomplete: null,
	onerror: null,
}

const mockIDBObjectStore = {
	get: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	clear: vi.fn(),
	getAllKeys: vi.fn(),
}

Object.defineProperty(global, 'indexedDB', {
	value: mockIndexedDB,
	writable: true,
})

describe('IndexedDBBackend', () => {
	// Clean up IndexedDB between tests
	beforeEach(async () => {
		vi.clearAllMocks()
		// Mock successful database operations
		mockIndexedDB.deleteDatabase.mockReturnValue({
			...mockIDBRequest,
			onsuccess: null,
			onerror: null,
		})
	})

	afterEach(async () => {
		// Clean up after each test
		if (typeof indexedDB !== 'undefined') {
			try {
				const deleteReq = indexedDB.deleteDatabase('test-file-cache')
				await new Promise((resolve, reject) => {
					deleteReq.onsuccess = () => resolve(undefined)
					deleteReq.onerror = () => reject(deleteReq.error)
				})
			} catch {
				// Ignore errors during cleanup
			}
		}
	})

	/**
	 * **Feature: persistent-file-cache, Property 9: Cold Cache LRU Eviction**
	 * **Validates: Requirements 4.4**
	 *
	 * For any sequence of cache accesses in Cold_Cache, when eviction occurs due to entry limit,
	 * the entry with the oldest last-access timestamp SHALL be evicted first.
	 */
	it('property: LRU eviction order is maintained in IndexedDB backend', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate test parameters
				fc.record({
					maxEntries: fc.integer({ min: 2, max: 4 }), // Small cache for easier eviction testing
					keys: fc
						.array(fc.string({ minLength: 1, maxLength: 8 }), {
							minLength: 3,
							maxLength: 8,
						})
						.filter((keys) => {
							// Ensure all keys are unique
							return new Set(keys).size === keys.length
						}),
				}),
				async ({ maxEntries, keys }) => {
					// Pre-condition: we need more keys than cache capacity to force eviction
					fc.pre(keys.length > maxEntries)

					// Create IndexedDB backend with test database
					const backend = createIndexedDBBackend({
						dbName: 'test-file-cache',
						storeName: 'test-entries',
						maxEntries,
						debounceDelay: 10, // Faster debounce for testing
					})

					// Add entries sequentially with small delays to ensure distinct timestamps
					for (let i = 0; i < keys.length; i++) {
						await backend.set(keys[i]!, `value-${i}`)

						// Small delay to ensure different access timestamps
						if (i < keys.length - 1) {
							await new Promise((resolve) => setTimeout(resolve, 5))
						}
					}

					// Wait for debounced writes to complete
					await new Promise((resolve) => setTimeout(resolve, 50))

					// Verify that evictions occurred by checking final cache size
					const finalKeys = await backend.keys()
					expect(finalKeys.length).toBeLessThanOrEqual(maxEntries)

					// The remaining keys should be the last ones added (most recent)
					const expectedRemainingKeys = keys.slice(-maxEntries)

					// Check that all expected remaining keys are present
					for (const key of expectedRemainingKeys) {
						const hasKey = await backend.has(key)
						expect(hasKey).toBe(true)
					}

					// Check that the earliest keys were evicted
					const expectedEvictedKeys = keys.slice(0, keys.length - maxEntries)
					for (const key of expectedEvictedKeys) {
						const hasKey = await backend.has(key)
						expect(hasKey).toBe(false)
					}

					// Clean up
					await backend.clear()
				}
			),
			{ numRuns: 10 }
		)
	})

	// Unit tests for specific functionality
	it('stores and retrieves values asynchronously', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		// Test basic set/get
		await backend.set('key1', 'value1')
		await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for debounced write

		const retrieved = await backend.get('key1')
		expect(retrieved).toBe('value1')

		// Test non-existent key
		const missing = await backend.get('nonexistent')
		expect(missing).toBe(null)

		await backend.clear()
	})

	it('handles different value types', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		// Test various data types
		await backend.set('string', 'hello world')
		await backend.set('number', 42)
		await backend.set('boolean', true)
		await backend.set('array', [1, 2, 3])
		await backend.set('object', { foo: 'bar', nested: { baz: 123 } })
		await backend.set('uint8array', new Uint8Array([1, 2, 3, 4]))

		await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for debounced writes

		expect(await backend.get('string')).toBe('hello world')
		expect(await backend.get('number')).toBe(42)
		expect(await backend.get('boolean')).toBe(true)
		expect(await backend.get('array')).toEqual([1, 2, 3])
		expect(await backend.get('object')).toEqual({
			foo: 'bar',
			nested: { baz: 123 },
		})
		expect(await backend.get('uint8array')).toEqual(
			new Uint8Array([1, 2, 3, 4])
		)

		await backend.clear()
	})

	it('tracks keys correctly', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		expect(await backend.keys()).toEqual([])

		await backend.set('key1', 'value1')
		await backend.set('key2', 'value2')
		await backend.set('key3', 'value3')

		await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for debounced writes

		const keys = await backend.keys()
		expect(keys.sort()).toEqual(['key1', 'key2', 'key3'])

		await backend.remove('key2')
		const keysAfterRemoval = await backend.keys()
		expect(keysAfterRemoval.sort()).toEqual(['key1', 'key3'])

		await backend.clear()
	})

	it('handles has() method correctly', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		expect(await backend.has('nonexistent')).toBe(false)

		await backend.set('key1', 'value1')

		// Should return true even before debounced write (checks pending writes)
		expect(await backend.has('key1')).toBe(true)

		await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for debounced write
		expect(await backend.has('key1')).toBe(true)

		await backend.remove('key1')
		expect(await backend.has('key1')).toBe(false)

		await backend.clear()
	})

	it('estimates size approximately', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		expect(await backend.estimateSize?.()).toBe(0)

		await backend.set('small', 'hi')
		const smallSize = await backend.estimateSize?.()
		expect(smallSize).toBeGreaterThan(0)

		await backend.set(
			'large',
			'this is a much longer string that should take more space'
		)
		const largeSize = await backend.estimateSize?.()
		expect(largeSize).toBeGreaterThan(smallSize)

		await backend.remove('large')
		const afterRemoval = await backend.estimateSize?.()
		expect(afterRemoval).toBeLessThan(largeSize)

		await backend.clear()
		expect(await backend.estimateSize?.()).toBe(0)
	})

	it('clears all data', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		await backend.set('key1', 'value1')
		await backend.set('key2', 'value2')
		await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for debounced writes

		expect((await backend.keys()).length).toBe(2)
		expect(await backend.estimateSize?.()).toBeGreaterThan(0)

		await backend.clear()

		expect(await backend.keys()).toEqual([])
		expect(await backend.estimateSize?.()).toBe(0)
		expect(await backend.has('key1')).toBe(false)
		expect(await backend.has('key2')).toBe(false)
	})

	it('handles remove operations', async () => {
		const backend = createIndexedDBBackend({
			dbName: 'test-file-cache',
			storeName: 'test-entries',
			debounceDelay: 10,
		})

		await backend.set('key1', 'value1')
		await backend.set('key2', 'value2')
		await new Promise((resolve) => setTimeout(resolve, 20)) // Wait for debounced writes

		expect(await backend.has('key1')).toBe(true)

		await backend.remove('key1')
		expect(await backend.has('key1')).toBe(false)
		expect(await backend.has('key2')).toBe(true)

		// Removing non-existent key should not throw
		await backend.remove('nonexistent')

		await backend.clear()
	})
})
