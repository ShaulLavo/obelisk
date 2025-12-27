import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { createCacheMetadataStore, createCacheEntryMetadata } from './metadataStore'
import type { CacheMetadataStoreInterface } from './metadataStore'

describe('CacheMetadataStore Browser Tests', () => {
	let metadataStore: CacheMetadataStoreInterface

	beforeEach(() => {
		localStorage.clear()
		metadataStore = createCacheMetadataStore()
	})

	afterEach(() => {
		localStorage.clear()
	})

	describe('Property 11: Staleness Detection', () => {
		/**
		 * Feature: persistent-file-cache, Property 11: Staleness Detection
		 * 
		 * For any cached entry with an associated mtime, if the file's current mtime 
		 * is newer than the cached mtime, the cached data SHALL be discarded and not returned.
		 * 
		 * **Validates: Requirements 7.4, 7.5**
		 */
		it('should correctly identify stale entries when current mtime is newer than cached mtime', () => {
			fc.assert(
				fc.property(
					// Generate file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Ensure valid path format
					// Generate cached mtime (timestamp in the past)
					fc.integer({ min: 1000000000000, max: Date.now() - 1000 }), // At least 1 second in the past
					// Generate current mtime (newer than cached)
					fc.integer({ min: 1000000000000, max: Date.now() + 86400000 }), // Up to 1 day in future
					// Generate tier
					fc.constantFrom('hot', 'warm', 'cold') as fc.Arbitrary<'hot' | 'warm' | 'cold'>
				, (path, cachedMtime, currentMtime, tier) => {
					// Pre-condition: current mtime must be newer than cached mtime for staleness
					fc.pre(currentMtime > cachedMtime)

					// Create metadata with cached mtime
					const metadata = createCacheEntryMetadata(tier, cachedMtime)
					metadataStore.setMetadata(path, metadata)

					// Check staleness with newer current mtime
					const isStale = metadataStore.isStale(path, currentMtime)
					
					// Should be stale since current mtime is newer
					expect(isStale).toBe(true)
				}),
				{ numRuns: 10 }
			)
		})

		it('should not identify entries as stale when current mtime is same or older than cached mtime', () => {
			fc.assert(
				fc.property(
					// Generate file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Ensure valid path format
					// Generate cached mtime
					fc.integer({ min: 1000000000000, max: Date.now() + 86400000 }), // Up to 1 day in future
					// Generate current mtime (same or older than cached)
					fc.integer({ min: 1000000000000, max: Date.now() + 86400000 }), // Up to 1 day in future
					// Generate tier
					fc.constantFrom('hot', 'warm', 'cold') as fc.Arbitrary<'hot' | 'warm' | 'cold'>
				, (path, cachedMtime, currentMtime, tier) => {
					// Pre-condition: current mtime must be same or older than cached mtime
					fc.pre(currentMtime <= cachedMtime)

					// Create metadata with cached mtime
					const metadata = createCacheEntryMetadata(tier, cachedMtime)
					metadataStore.setMetadata(path, metadata)

					// Check staleness with same or older current mtime
					const isStale = metadataStore.isStale(path, currentMtime)
					
					// Should not be stale since current mtime is not newer
					expect(isStale).toBe(false)
				}),
				{ numRuns: 10 }
			)
		})

		it('should treat entries as stale when no metadata exists', () => {
			fc.assert(
				fc.property(
					// Generate file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Ensure valid path format
					// Generate current mtime
					fc.option(fc.integer({ min: 1000000000000, max: Date.now() + 86400000 }), { nil: undefined })
				, (path, currentMtime) => {
					// Ensure no metadata exists for this path
					expect(metadataStore.getMetadata(path)).toBeNull()

					// Check staleness - should be stale when no metadata exists
					const isStale = metadataStore.isStale(path, currentMtime)
					
					// Should be stale since no metadata exists
					expect(isStale).toBe(true)
				}),
				{ numRuns: 10 }
			)
		})

		it('should not treat entries as stale when no current mtime is provided', () => {
			fc.assert(
				fc.property(
					// Generate file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Ensure valid path format
					// Generate cached mtime
					fc.option(fc.integer({ min: 1000000000000, max: Date.now() + 86400000 }), { nil: undefined }),
					// Generate tier
					fc.constantFrom('hot', 'warm', 'cold') as fc.Arbitrary<'hot' | 'warm' | 'cold'>
				, (path, cachedMtime, tier) => {
					// Create metadata with or without cached mtime
					const metadata = createCacheEntryMetadata(tier, cachedMtime)
					metadataStore.setMetadata(path, metadata)

					// Check staleness without providing current mtime
					const isStale = metadataStore.isStale(path, undefined)
					
					// Should not be stale when no current mtime is provided
					expect(isStale).toBe(false)
				}),
				{ numRuns: 10 }
			)
		})

		it('should not treat entries as stale when cached metadata has no mtime', () => {
			fc.assert(
				fc.property(
					// Generate file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Ensure valid path format
					// Generate current mtime
					fc.integer({ min: 1000000000000, max: Date.now() + 86400000 }),
					// Generate tier
					fc.constantFrom('hot', 'warm', 'cold') as fc.Arbitrary<'hot' | 'warm' | 'cold'>
				, (path, currentMtime, tier) => {
					// Create metadata without mtime (undefined)
					const metadata = createCacheEntryMetadata(tier, undefined)
					metadataStore.setMetadata(path, metadata)

					// Check staleness with current mtime provided
					const isStale = metadataStore.isStale(path, currentMtime)
					
					// Should not be stale when cached metadata has no mtime
					expect(isStale).toBe(false)
				}),
				{ numRuns: 10 }
			)
		})
	})

	describe('Basic functionality', () => {
		it('should store and retrieve metadata', () => {
			const path = '/test.ts'
			const metadata = createCacheEntryMetadata('hot', 1234567890)
			
			metadataStore.setMetadata(path, metadata)
			const retrieved = metadataStore.getMetadata(path)
			
			expect(retrieved).toEqual(metadata)
		})

		it('should update last access time', async () => {
			const path = '/test.ts'
			const metadata = createCacheEntryMetadata('hot', 1234567890)
			
			metadataStore.setMetadata(path, metadata)
			
			const originalAccess = metadata.lastAccess
			
			// Wait a bit to ensure different timestamp
			await new Promise(resolve => setTimeout(resolve, 10))
			
			metadataStore.updateLastAccess(path)
			
			const updated = metadataStore.getMetadata(path)
			expect(updated?.lastAccess).toBeGreaterThan(originalAccess)
		})

		it('should maintain LRU order', () => {
			const paths = ['/a.ts', '/b.ts', '/c.ts']
			
			// Add entries in order
			paths.forEach((path, i) => {
				const metadata = createCacheEntryMetadata('hot', 1234567890 + i)
				metadataStore.setMetadata(path, metadata)
			})
			
			// LRU order should match insertion order
			expect(metadataStore.getLRUOrder()).toEqual(paths)
			
			// Access first entry again
			metadataStore.updateLastAccess(paths[0]!)
			
			// First entry should now be at the end (most recently used)
			expect(metadataStore.getLRUOrder()).toEqual([paths[1], paths[2], paths[0]])
		})

		it('should remove metadata', () => {
			const path = '/test.ts'
			const metadata = createCacheEntryMetadata('hot', 1234567890)
			
			metadataStore.setMetadata(path, metadata)
			expect(metadataStore.getMetadata(path)).toEqual(metadata)
			
			metadataStore.removeMetadata(path)
			expect(metadataStore.getMetadata(path)).toBeNull()
			expect(metadataStore.getLRUOrder()).not.toContain(path)
		})

		it('should persist and load metadata', () => {
			const path = '/test.ts'
			const metadata = createCacheEntryMetadata('hot', 1234567890)
			
			metadataStore.setMetadata(path, metadata)
			metadataStore.persist()
			
			// Create new store and load
			const newStore = createCacheMetadataStore()
			newStore.load()
			
			expect(newStore.getMetadata(path)).toEqual(metadata)
		})

		it('should enforce max entries limit', () => {
			const store = createCacheMetadataStore({ maxEntries: 2 })
			
			// Add 3 entries
			store.setMetadata('/a.ts', createCacheEntryMetadata('hot'))
			store.setMetadata('/b.ts', createCacheEntryMetadata('hot'))
			store.setMetadata('/c.ts', createCacheEntryMetadata('hot'))
			
			// Should only have 2 entries (oldest evicted)
			expect(store.getAllPaths()).toHaveLength(2)
			expect(store.getMetadata('/a.ts')).toBeNull() // Oldest should be evicted
			expect(store.getMetadata('/b.ts')).not.toBeNull()
			expect(store.getMetadata('/c.ts')).not.toBeNull()
		})

		it('should work with real localStorage in browser environment', () => {
			const path = '/browser-test.ts'
			const metadata = createCacheEntryMetadata('warm', Date.now())
			
			// Store metadata
			metadataStore.setMetadata(path, metadata)
			metadataStore.persist()
			
			// Verify it was actually stored in localStorage (default key is 'fc-meta:store')
			const stored = localStorage.getItem('fc-meta:store')
			expect(stored).toBeTruthy()
			
			// Create new store instance and load from localStorage
			const newStore = createCacheMetadataStore()
			newStore.load()
			
			// Should retrieve the same metadata
			const retrieved = newStore.getMetadata(path)
			expect(retrieved).toEqual(metadata)
		})
	})
})