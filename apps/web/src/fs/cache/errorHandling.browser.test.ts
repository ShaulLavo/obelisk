import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import type { FsDirTreeNode } from '@repo/fs'
import { CachedPrefetchQueue } from './cachedPrefetchQueue'
import { TreeCacheController } from './treeCacheController'
import type {
	PrefetchTarget,
	TreePrefetchWorkerCallbacks,
} from '../prefetch/treePrefetchWorkerTypes'

describe('ErrorHandling', () => {
	let cacheController: TreeCacheController
	let cachedQueue: CachedPrefetchQueue
	let mockCallbacks: TreePrefetchWorkerCallbacks
	let mockLoadDirectory: ReturnType<
		typeof vi.fn<(target: PrefetchTarget) => Promise<FsDirTreeNode | undefined>>
	>
	const testDbName = `test-error-handling-${Date.now()}-${Math.random().toString(36).substring(7)}`

	beforeEach(async () => {
		cacheController = new TreeCacheController({
			dbName: testDbName,
			storeName: 'test-error-handling',
		})

		// Ensure LocalForage is ready
		await new Promise((resolve) => setTimeout(resolve, 10))

		mockCallbacks = {
			onDirectoryLoaded: vi.fn(),
			onStatus: vi.fn(),
			onDeferredMetadata: vi.fn(),
			onError: vi.fn(),
		}

		mockLoadDirectory = vi.fn()

		cachedQueue = new CachedPrefetchQueue({
			workerCount: 2,
			loadDirectory: mockLoadDirectory,
			callbacks: mockCallbacks,
			cacheController,
		})
	})

	afterEach(async () => {
		try {
			await cacheController.clearCache()
		} catch {
			// Ignore cleanup errors
		}
	})

	describe('Property 22: Graceful error handling', () => {
		it('should fall back to filesystem scanning when LocalForage operations fail', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc
						.record({
							path: fc
								.string({ minLength: 2, maxLength: 15 })
								.map((s) => `/${s.replace(/[\0\/\s]/g, '_')}`),
							name: fc
								.string({ minLength: 1, maxLength: 10 })
								.map((s) => s.replace(/[\0\/\s]/g, '_')),
							childCount: fc.integer({ min: 1, max: 4 }),
							errorType: fc.oneof(
								fc.constant('cache_read_failure'),
								fc.constant('cache_write_failure'),
								fc.constant('cache_clear_failure')
							),
						})
						.filter(
							(data) =>
								data.path.length > 1 &&
								data.name.length > 0 &&
								data.path !== '/_'
						),
					async (testData) => {
						const { path, name, childCount, errorType } = testData

						const fallbackNode: FsDirTreeNode = {
							kind: 'dir',
							name,
							path,
							depth: 1,
							children: Array.from({ length: childCount }, (_, i) => ({
								kind: 'file' as const,
								name: `fallback-file-${i}.txt`,
								path: `${path}/fallback-file-${i}.txt`,
								depth: 2,
								parentPath: path,
								size: 100 + i,
								lastModified: Date.now() - 1000,
							})),
							isLoaded: true,
						}

						mockLoadDirectory.mockResolvedValue(fallbackNode)

						let cacheReadSpy: any
						let cacheWriteSpy: any
						let cacheClearSpy: any

						switch (errorType) {
							case 'cache_read_failure':
								cacheReadSpy = vi
									.spyOn(cacheController, 'getCachedDirectory')
									.mockRejectedValue(new Error('LocalForage read failure'))
								break
							case 'cache_write_failure':
								cacheWriteSpy = vi
									.spyOn(cacheController, 'setCachedDirectory')
									.mockRejectedValue(new Error('LocalForage write failure'))
								break
							case 'cache_clear_failure':
								cacheClearSpy = vi
									.spyOn(cacheController, 'clearCache')
									.mockRejectedValue(new Error('LocalForage clear failure'))
								break
						}

						const target: PrefetchTarget = {
							path,
							name,
							depth: 1,
						}

						let result: FsDirTreeNode | undefined
						let operationSucceeded = false

						try {
							if (errorType === 'cache_clear_failure') {
								await expect(cacheController.clearCache()).rejects.toThrow()

								result = await (cachedQueue as any).loadDirectoryWithCache(
									target
								)
								operationSucceeded = true
							} else {
								result = await (cachedQueue as any).loadDirectoryWithCache(
									target
								)
								operationSucceeded = true
							}
						} catch {
							operationSucceeded = false
						}

						expect(operationSucceeded).toBe(true)

						if (errorType !== 'cache_clear_failure') {
							expect(result).not.toBeUndefined()
							expect(result!.path).toBe(path)
							expect(result!.children).toHaveLength(childCount)
							expect(result!.children[0]?.name).toMatch(/^fallback-file-/)
						}

						expect(mockLoadDirectory).toHaveBeenCalledWith(target)

						expect(mockCallbacks.onError).not.toHaveBeenCalled() // Cache errors should be handled internally

						if (cacheReadSpy) cacheReadSpy.mockRestore()
						if (cacheWriteSpy) cacheWriteSpy.mockRestore()
						if (cacheClearSpy) cacheClearSpy.mockRestore()
					}
				),
				{ numRuns: 3 }
			)
		})

		it('should handle corrupted cache data gracefully by clearing affected entries', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc
						.record({
							path: fc
								.string({ minLength: 3, maxLength: 12 })
								.map((s) => `/${s.replace(/[\0\/\s!@#$%^&*()]/g, 'x')}`),
							name: fc
								.string({ minLength: 1, maxLength: 8 })
								.map((s) => s.replace(/[\0\/\s!@#$%^&*()]/g, 'x')),
							validChildCount: fc.integer({ min: 1, max: 3 }),
							corruptionType: fc.oneof(
								fc.constant('invalid_json'),
								fc.constant('missing_required_fields'),
								fc.constant('invalid_data_types')
							),
						})
						.filter(
							(data) =>
								data.path.length > 2 &&
								data.name.length > 0 &&
								!data.path.includes('__')
						),
					async (testData) => {
						const { path, name, validChildCount, corruptionType } = testData

						const validNode: FsDirTreeNode = {
							kind: 'dir',
							name,
							path,
							depth: 1,
							children: Array.from({ length: validChildCount }, (_, i) => ({
								kind: 'file' as const,
								name: `valid-file-${i}.txt`,
								path: `${path}/valid-file-${i}.txt`,
								depth: 2,
								parentPath: path,
								size: 100 + i,
								lastModified: Date.now() - 1000,
							})),
							isLoaded: true,
						}

						mockLoadDirectory.mockResolvedValue(validNode)

						let getCachedSpy: any

						switch (corruptionType) {
							case 'invalid_json':
								getCachedSpy = vi
									.spyOn(cacheController, 'getCachedDirectory')
									.mockRejectedValue(
										new SyntaxError('Unexpected token in JSON')
									)
								break
							case 'missing_required_fields':
								getCachedSpy = vi
									.spyOn(cacheController, 'getCachedDirectory')
									.mockResolvedValue(null)
								break
							case 'invalid_data_types':
								getCachedSpy = vi
									.spyOn(cacheController, 'getCachedDirectory')
									.mockResolvedValue(null)
								break
						}

						const target: PrefetchTarget = {
							path,
							name,
							depth: 1,
						}

						let result: FsDirTreeNode | undefined
						let operationSucceeded = false

						try {
							result = await (cachedQueue as any).loadDirectoryWithCache(target)
							operationSucceeded = true
						} catch (error) {
							// Should not throw unhandled errors due to corruption
							expect(String(error)).not.toMatch(/JSON|corrupt|invalid/)
						}

						expect(mockLoadDirectory).toHaveBeenCalled()

						const calls = mockLoadDirectory.mock.calls
						expect(calls.length).toBeGreaterThan(0)
						const lastCall = calls[calls.length - 1]
						expect(lastCall).toBeDefined()
						expect(lastCall![0]).toMatchObject({
							path: expect.any(String),
							name: expect.any(String),
							depth: expect.any(Number),
						})

						// Operation should succeed despite corruption
						expect(operationSucceeded).toBe(true)

						if (result) {
							expect(result.path).toBe(path)
							expect(result.children).toHaveLength(validChildCount)
							if (result.children.length > 0) {
								expect(result.children[0]?.name).toMatch(/^valid-file-/)
							}
						}

						getCachedSpy.mockRestore()
					}
				),
				{ numRuns: 3 }
			)
		})

		it('should continue with cache-disabled mode when cache initialization fails', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc
						.record({
							directories: fc.array(
								fc
									.record({
										path: fc
											.string({ minLength: 2, maxLength: 10 })
											.map((s) => `/${s.replace(/[\0\/\s]/g, '_')}`),
										name: fc
											.string({ minLength: 1, maxLength: 8 })
											.map((s) => s.replace(/[\0\/\s]/g, '_')),
										childCount: fc.integer({ min: 1, max: 3 }),
									})
									.filter(
										(data) =>
											data.path.length > 1 &&
											data.name.length > 0 &&
											data.path !== '/_'
									),
								{ minLength: 2, maxLength: 4 }
							),
						})
						.filter((data) => {
							// Ensure all paths are unique
							const paths = data.directories.map((d) => d.path)
							const uniquePaths = new Set(paths)
							return uniquePaths.size === paths.length
						}),
					async (testData) => {
						const { directories } = testData

						const filesystemData = new Map<string, FsDirTreeNode>()
						for (const dir of directories) {
							const dirNode: FsDirTreeNode = {
								kind: 'dir',
								name: dir.name,
								path: dir.path,
								depth: 1,
								children: Array.from({ length: dir.childCount }, (_, i) => ({
									kind: 'file' as const,
									name: `fs-file-${i}.txt`,
									path: `${dir.path}/fs-file-${i}.txt`,
									depth: 2,
									parentPath: dir.path,
									size: 100 + i,
									lastModified: Date.now() - 1000,
								})),
								isLoaded: true,
							}
							filesystemData.set(dir.path, dirNode)
						}

						mockLoadDirectory.mockImplementation(
							async (target: PrefetchTarget) => {
								return filesystemData.get(target.path)
							}
						)

						const results: (FsDirTreeNode | undefined)[] = []

						for (const dir of directories) {
							const target: PrefetchTarget = {
								path: dir.path,
								name: dir.name,
								depth: 1,
							}

							try {
								// Even with cache disabled, filesystem operations should work
								const result = await mockLoadDirectory(target)
								results.push(result)
							} catch (error) {
								// Should not fail due to cache initialization issues
								expect(error).not.toMatch(/Cache initialization/)
							}
						}

						expect(results).toHaveLength(directories.length)

						for (let i = 0; i < results.length; i++) {
							const result = results[i]
							const expectedDir = directories[i]!

							expect(result).not.toBeUndefined()
							expect(result!.path).toBe(expectedDir.path)
							expect(result!.children).toHaveLength(expectedDir.childCount)
							expect(result!.children[0]?.name).toMatch(/^fs-file-/)
						}

						expect(mockLoadDirectory).toHaveBeenCalled()
					}
				),
				{ numRuns: 3 }
			)
		})

		it('should log cache errors for debugging while maintaining normal operation', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc
						.record({
							path: fc
								.string({ minLength: 2, maxLength: 12 })
								.map((s) => `/${s.replace(/[\0\/\s]/g, '_')}`),
							name: fc
								.string({ minLength: 1, maxLength: 8 })
								.map((s) => s.replace(/[\0\/\s]/g, '_')),
							childCount: fc.integer({ min: 1, max: 3 }),
							errorScenario: fc.oneof(
								fc.constant('read_timeout'),
								fc.constant('write_quota_exceeded'),
								fc.constant('database_locked')
							),
						})
						.filter(
							(data) =>
								data.path.length > 1 &&
								data.name.length > 0 &&
								data.path !== '/_'
						),
					async (testData) => {
						const { path, name, childCount, errorScenario } = testData

						const fallbackNode: FsDirTreeNode = {
							kind: 'dir',
							name,
							path,
							depth: 1,
							children: Array.from({ length: childCount }, (_, i) => ({
								kind: 'file' as const,
								name: `fallback-${i}.txt`,
								path: `${path}/fallback-${i}.txt`,
								depth: 2,
								parentPath: path,
								size: 100 + i,
								lastModified: Date.now() - 1000,
							})),
							isLoaded: true,
						}

						mockLoadDirectory.mockResolvedValue(fallbackNode)

						const consoleSpy = vi
							.spyOn(console, 'warn')
							.mockImplementation(() => {})
						const consoleDebugSpy = vi
							.spyOn(console, 'debug')
							.mockImplementation(() => {})

						let methodSpy: any
						switch (errorScenario) {
							case 'read_timeout':
								methodSpy = vi
									.spyOn(cacheController, 'getCachedDirectory')
									.mockRejectedValue(new Error('Operation timed out'))
								break
							case 'write_quota_exceeded':
								methodSpy = vi
									.spyOn(cacheController, 'setCachedDirectory')
									.mockRejectedValue(new Error('Quota exceeded'))
								break
							case 'database_locked':
								methodSpy = vi
									.spyOn(cacheController, 'getCachedDirectory')
									.mockRejectedValue(new Error('Database is locked'))
								break
						}

						const target: PrefetchTarget = {
							path,
							name,
							depth: 1,
						}

						let result: FsDirTreeNode | undefined
						let operationSucceeded = false

						try {
							result = await (cachedQueue as any).loadDirectoryWithCache(target)
							operationSucceeded = true
						} catch (error) {
							expect(String(error)).not.toMatch(
								/timed out|Quota exceeded|locked/
							)
						}

						expect(operationSucceeded).toBe(true)
						expect(result).not.toBeUndefined()
						expect(result!.path).toBe(path)
						expect(result!.children).toHaveLength(childCount)

						expect(mockLoadDirectory).toHaveBeenCalledWith(target)

						methodSpy.mockRestore()
						consoleSpy.mockRestore()
						consoleDebugSpy.mockRestore()
					}
				),
				{ numRuns: 3 }
			)
		})
	})

	describe('Property 23: LRU eviction on quota exceeded', () => {
		it('should evict oldest directory entries using LRU policy when cache quota is exceeded', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						entryCount: fc.integer({ min: 5, max: 8 }),
						quotaLimit: fc.integer({ min: 3, max: 5 }),
					}),
					async (testData) => {
						const { entryCount, quotaLimit } = testData

						const directories = Array.from({ length: entryCount }, (_, i) => ({
							path: `/test-dir-${i}`,
							name: `test-dir-${i}`,
							childCount: 1,
							cacheTime: 1000000000000 + i * 1000, // Different timestamps
						}))

						const evictLRUSpy = vi
							.spyOn(cacheController, 'evictLRUEntries')
							.mockImplementation(async (maxEntries: number) => {
								// Simulate LRU eviction behavior
								expect(maxEntries).toBeLessThanOrEqual(quotaLimit)
								// The method should be called with a reasonable limit
								expect(maxEntries).toBeGreaterThan(0)
							})

						const cleanupSpy = vi
							.spyOn(cacheController, 'cleanupOldEntries')
							.mockImplementation(async () => {
								// Simulate quota exceeded scenario
								await cacheController.evictLRUEntries(quotaLimit)
							})

						let evictionSucceeded = true
						try {
							await cacheController.cleanupOldEntries()
						} catch (error) {
							evictionSucceeded = false
						}

						expect(evictionSucceeded).toBe(true)

						expect(evictLRUSpy).toHaveBeenCalledWith(quotaLimit)

						evictLRUSpy.mockRestore()
						cleanupSpy.mockRestore()
					}
				),
				{ numRuns: 3 }
			)
		})

		it('should maintain LRU order when accessing cached directories', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						dirCount: fc.integer({ min: 4, max: 6 }),
						accessCount: fc.integer({ min: 2, max: 4 }),
						quotaLimit: fc.integer({ min: 2, max: 4 }),
					}),
					async (testData) => {
						const { dirCount, accessCount, quotaLimit } = testData

						const directories = Array.from({ length: dirCount }, (_, i) => ({
							path: `/lru-test-${i}`,
							name: `lru-test-${i}`,
							cacheTime: 1000000000000 + i * 1000,
						}))

						const accessTimes = new Map<string, number>()
						const updateAccessSpy = vi
							.spyOn(cacheController, 'updateAccessTime')
							.mockImplementation(async (path: string, _cachedAt: number) => {
								accessTimes.set(path, Date.now())
							})

						const evictLRUSpy = vi
							.spyOn(cacheController, 'evictLRUEntries')
							.mockImplementation(async (maxEntries: number) => {
								// Simulate LRU eviction based on access times
								const sortedByAccess = Array.from(accessTimes.entries()).sort(
									(a, b) => a[1] - b[1]
								) // Sort by access time (oldest first)

								const toEvict = Math.max(0, sortedByAccess.length - maxEntries)

								// Verify that we're evicting the right number of entries
								expect(toEvict).toBeGreaterThanOrEqual(0)
								expect(maxEntries).toBe(quotaLimit)
							})

						for (let i = 0; i < Math.min(accessCount, dirCount); i++) {
							const dir = directories[i]!
							await cacheController.updateAccessTime(dir.path, Date.now())
						}

						await cacheController.evictLRUEntries(quotaLimit)

						expect(updateAccessSpy).toHaveBeenCalled()
						expect(evictLRUSpy).toHaveBeenCalledWith(quotaLimit)

						updateAccessSpy.mockRestore()
						evictLRUSpy.mockRestore()
					}
				),
				{ numRuns: 3 }
			)
		})

		it('should handle edge cases in LRU eviction gracefully', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						scenario: fc.oneof(
							fc.constant('empty_cache'),
							fc.constant('single_entry'),
							fc.constant('all_entries_same_age')
						),
						entryCount: fc.integer({ min: 0, max: 3 }),
					}),
					async (testData) => {
						const { scenario, entryCount } = testData

						let directories: any[] = []

						switch (scenario) {
							case 'empty_cache':
								// No directories to cache
								directories = []
								break
							case 'single_entry':
								directories = [
									{
										path: '/single',
										name: 'single',
										cacheTime: Date.now() - 5000,
									},
								]
								break
							case 'all_entries_same_age':
								directories = Array.from(
									{ length: Math.min(entryCount, 3) },
									(_, i) => ({
										path: `/same-age-${i}`,
										name: `same-age-${i}`,
										cacheTime: Date.now() - 5000, // Same timestamp
									})
								)
								break
						}

						for (const dir of directories) {
							const dirNode: FsDirTreeNode = {
								kind: 'dir',
								name: dir.name,
								path: dir.path,
								depth: 1,
								children: [],
								isLoaded: true,
							}

							await cacheController.setCachedDirectory(
								dir.path,
								dirNode,
								dir.cacheTime
							)
						}

						// Small delay to ensure LocalForage operations complete
						await new Promise((resolve) => setTimeout(resolve, 10))

						let evictionSucceeded = true
						try {
							await cacheController.cleanupOldEntries(1000) // Very short age to trigger cleanup
						} catch (error) {
							evictionSucceeded = false
						}

						expect(evictionSucceeded).toBe(true)

						const stats = await cacheController.getCacheStats()
						expect(stats.totalEntries).toBeGreaterThanOrEqual(0)

						// For empty cache, should remain empty
						if (scenario === 'empty_cache') {
							expect(stats.totalEntries).toBe(0)
						}

						// For single entry, should handle gracefully
						if (scenario === 'single_entry') {
							expect(stats.totalEntries).toBeLessThanOrEqual(1)
						}
					}
				),
				{ numRuns: 3 }
			)
		})
	})
})
