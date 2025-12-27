import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { TierRouter } from './tierRouter'
import type { StorageBackend } from './backends/types'
import type { FileCacheEntry } from './fileCacheController'

// Helper to generate safe serializable values for testing
const safeValueArb = fc.oneof(
	fc.string(),
	fc.integer(),
	fc.boolean(),
	fc.float(),
	fc.array(fc.string()),
	fc.record({ 
		id: fc.string(),
		value: fc.oneof(fc.string(), fc.integer(), fc.boolean())
	})
)

// Mock backends for testing
class MockStorageBackend implements StorageBackend<unknown> {
	private storage = new Map<string, unknown>()
	public operations: Array<{ op: string; key: string; value?: unknown }> = []

	async get(key: string): Promise<unknown | null> {
		this.operations.push({ op: 'get', key })
		return this.storage.has(key) ? this.storage.get(key) : null
	}

	async set(key: string, value: unknown): Promise<unknown> {
		this.operations.push({ op: 'set', key, value })
		// Don't store undefined values
		if (value !== undefined) {
			this.storage.set(key, value)
		}
		return value
	}

	async remove(key: string): Promise<void> {
		this.operations.push({ op: 'remove', key })
		this.storage.delete(key)
	}

	async has(key: string): Promise<boolean> {
		this.operations.push({ op: 'has', key })
		return this.storage.has(key)
	}

	async keys(): Promise<string[]> {
		this.operations.push({ op: 'keys', key: '' })
		return Array.from(this.storage.keys())
	}

	async clear(): Promise<void> {
		this.operations.push({ op: 'clear', key: '' })
		this.storage.clear()
	}

	async estimateSize(): Promise<number> {
		return this.storage.size * 100 // Mock size estimation
	}

	// Test helpers
	getStoredValue(key: string): unknown | undefined {
		return this.storage.get(key)
	}

	clearOperations(): void {
		this.operations = []
	}
}

describe('TierRouter Browser Tests', () => {
	let hotBackend: MockStorageBackend
	let warmBackend: MockStorageBackend
	let coldBackend: MockStorageBackend
	let tierRouter: TierRouter

	beforeEach(() => {
		hotBackend = new MockStorageBackend()
		warmBackend = new MockStorageBackend()
		coldBackend = new MockStorageBackend()
		
		tierRouter = new TierRouter({
			hot: hotBackend,
			warm: warmBackend,
			cold: coldBackend
		})
	})

	describe('Property 1: Tier Routing Consistency', () => {
		it('should route data types to correct tiers according to configuration', async () => {
			await fc.assert(
				fc.asyncProperty(
					// Generate custom routing config
					fc.record({
						warm: fc.subarray(['scrollPosition', 'visibleContent', 'stats'] as Array<keyof FileCacheEntry>),
						cold: fc.subarray(['pieceTable', 'highlights', 'folds', 'brackets', 'errors', 'previewBytes'] as Array<keyof FileCacheEntry>),
						hotOnly: fc.subarray(['stats', 'highlights'] as Array<keyof FileCacheEntry>)
					}),
					// Generate file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')),
					// Generate data type and value
					fc.constantFrom(
						'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds', 
						'brackets', 'errors', 'scrollPosition', 'visibleContent'
					) as fc.Arbitrary<keyof FileCacheEntry>,
					safeValueArb
				, async (routing, path, dataType, value) => {
					// Create fresh backends for each test to avoid state pollution
					const testHotBackend = new MockStorageBackend()
					const testWarmBackend = new MockStorageBackend()
					const testColdBackend = new MockStorageBackend()

					// Create router with custom routing
					const customRouter = new TierRouter({
						hot: testHotBackend,
						warm: testWarmBackend,
						cold: testColdBackend,
						routing
					})

					// Store the value
					await customRouter.set(path, dataType, value)

					// Determine expected tier
					let expectedTier: 'hot' | 'warm' | 'cold'
					if (routing.hotOnly.includes(dataType)) {
						expectedTier = 'hot'
					} else if (routing.warm.includes(dataType)) {
						expectedTier = 'warm'
					} else if (routing.cold.includes(dataType)) {
						expectedTier = 'cold'
					} else {
						expectedTier = 'cold' // Default
					}

					// Check that value was stored in correct tier
					const expectedKey = `v1:${path}:${dataType}`
					
					const hotValue = testHotBackend.getStoredValue(expectedKey)
					const warmValue = testWarmBackend.getStoredValue(expectedKey)
					const coldValue = testColdBackend.getStoredValue(expectedKey)

					switch (expectedTier) {
						case 'hot':
							expect(hotValue).toBe(value)
							expect(warmValue).toBeUndefined()
							expect(coldValue).toBeUndefined()
							break
						case 'warm':
							expect(hotValue).toBeUndefined()
							expect(warmValue).toBe(value)
							expect(coldValue).toBeUndefined()
							break
						case 'cold':
							expect(hotValue).toBeUndefined()
							expect(warmValue).toBeUndefined()
							expect(coldValue).toBe(value)
							break
					}
				}),
				{ numRuns: 10 }
			)
		})
	})

	describe('Property 2: Tier Lookup Order', () => {
		it('should return value from highest-priority tier when present in multiple tiers', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')),
					fc.constantFrom(
						'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds', 
						'brackets', 'errors', 'scrollPosition', 'visibleContent'
					) as fc.Arbitrary<keyof FileCacheEntry>,
					safeValueArb,
					safeValueArb,
					safeValueArb
				, async (path, dataType, hotValue, warmValue, coldValue) => {
					const key = `v1:${path}:${dataType}`
					
					// Store different values in each tier
					await hotBackend.set(key, hotValue)
					await warmBackend.set(key, warmValue)
					await coldBackend.set(key, coldValue)

					// Get should return hot value (highest priority)
					const result = await tierRouter.get(path, dataType)
					expect(result).toBe(hotValue)
				}),
				{ numRuns: 15 }
			)
		})

		it('should return warm value when not in hot but in warm and cold', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')),
					fc.constantFrom(
						'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds', 
						'brackets', 'errors', 'scrollPosition', 'visibleContent'
					) as fc.Arbitrary<keyof FileCacheEntry>,
					safeValueArb,
					safeValueArb
				, async (path, dataType, warmValue, coldValue) => {
					const key = `v1:${path}:${dataType}`
					
					// Store values only in warm and cold tiers
					await warmBackend.set(key, warmValue)
					await coldBackend.set(key, coldValue)

					// Clear hot backend operations to verify promotion
					hotBackend.clearOperations()

					// Get should return warm value and promote to hot
					const result = await tierRouter.get(path, dataType)
					expect(result).toBe(warmValue)
					
					// Verify promotion to hot cache
					expect(hotBackend.getStoredValue(key)).toBe(warmValue)
				}),
				{ numRuns: 15 }
			)
		})

		it('should return cold value when only in cold tier and promote to hot', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')),
					fc.constantFrom(
						'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds', 
						'brackets', 'errors', 'scrollPosition', 'visibleContent'
					) as fc.Arbitrary<keyof FileCacheEntry>,
					safeValueArb
				, async (path, dataType, coldValue) => {
					const key = `v1:${path}:${dataType}`
					
					// Store value only in cold tier
					await coldBackend.set(key, coldValue)

					// Clear hot backend operations to verify promotion
					hotBackend.clearOperations()

					// Get should return cold value and promote to hot
					const result = await tierRouter.get(path, dataType)
					expect(result).toBe(coldValue)
					
					// Verify promotion to hot cache
					expect(hotBackend.getStoredValue(key)).toBe(coldValue)
				}),
				{ numRuns: 15 }
			)
		})
	})

	describe('Property 8: Cold Cache Promotion on Access', () => {
		it('should promote cold cache entries to hot cache when accessed', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')),
					fc.constantFrom(
						'pieceTable', 'stats', 'previewBytes', 'highlights', 'folds', 
						'brackets', 'errors', 'scrollPosition', 'visibleContent'
					) as fc.Arbitrary<keyof FileCacheEntry>,
					fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.float())
				, async (path, dataType, value) => {
					const key = `v1:${path}:${dataType}`
					
					// Store value only in cold tier
					await coldBackend.set(key, value)
					
					// Verify it's not in hot cache initially
					expect(hotBackend.getStoredValue(key)).toBeUndefined()
					
					// Access via router should promote to hot
					const result = await tierRouter.get(path, dataType)
					expect(result).toBe(value)
					
					// Verify promotion to hot cache occurred
					expect(hotBackend.getStoredValue(key)).toBe(value)
					
					// Subsequent access should come from hot cache
					hotBackend.clearOperations()
					const result2 = await tierRouter.get(path, dataType)
					expect(result2).toBe(value)
					
					// Verify hot cache was accessed (should be first operation)
					expect(hotBackend.operations[0]?.op).toBe('get')
				}),
				{ numRuns: 15 }
			)
		})
	})
})