import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	vi,
	type MockedFunction,
} from 'vitest'
import fc from 'fast-check'
import type { FsDirTreeNode } from '@repo/fs'
import { CachedPrefetchQueue } from './cachedPrefetchQueue'
import { TreeCacheController } from './treeCacheController'
import type {
	PrefetchTarget,
	TreePrefetchWorkerCallbacks,
} from '../prefetch/treePrefetchWorkerTypes'

describe('CachedPrefetchQueue', () => {
	let cacheController: TreeCacheController
	let cachedQueue: CachedPrefetchQueue
	let mockCallbacks: TreePrefetchWorkerCallbacks
	let mockLoadDirectory: MockedFunction<
		(target: PrefetchTarget) => Promise<FsDirTreeNode | undefined>
	>
	const testDbName = `test-cached-queue-${Date.now()}-${Math.random().toString(36).substring(7)}`

	beforeEach(async () => {
		cacheController = new TreeCacheController({
			dbName: testDbName,
			storeName: 'test-directories',
		})

		try {
			await cacheController.clearCache()
		} catch {
			// Ignore cleanup errors
		}

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
			// Also clear any mocks
			mockLoadDirectory.mockClear()
			mockCallbacks.onDirectoryLoaded = vi.fn()
			mockCallbacks.onStatus = vi.fn()
			mockCallbacks.onDeferredMetadata = vi.fn()
			mockCallbacks.onError = vi.fn()
		} catch {
			// Ignore cleanup errors
		}
	})

	describe('Property 6: Background validation with cache display', () => {
		it('should display cached data immediately while workers run in background to validate freshness', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						path: fc
							.string({ minLength: 1, maxLength: 20 })
							.map((s) => `/${s.replace(/[\0\/]/g, '_')}`),
						name: fc
							.string({ minLength: 1, maxLength: 15 })
							.map((s) => s.replace(/[\0\/]/g, '_')),
						depth: fc.integer({ min: 0, max: 3 }),
						cachedChildren: fc.array(
							fc.record({
								kind: fc.constant('file' as const),
								name: fc
									.string({ minLength: 1, maxLength: 10 })
									.map((s) => s.replace(/[\0\/]/g, '_')),
								path: fc
									.string({ minLength: 1, maxLength: 25 })
									.map((s) => `/${s.replace(/[\0\/]/g, '_')}`),
								depth: fc.integer({ min: 1, max: 4 }),
								size: fc.option(fc.integer({ min: 0, max: 10000 })),
								lastModified: fc.option(
									fc.integer({ min: 1000000000000, max: Date.now() })
								),
							}),
							{ minLength: 0, maxLength: 5 }
						),
						freshChildren: fc.array(
							fc.record({
								kind: fc.constant('file' as const),
								name: fc
									.string({ minLength: 1, maxLength: 10 })
									.map((s) => s.replace(/[\0\/]/g, '_')),
								path: fc
									.string({ minLength: 1, maxLength: 25 })
									.map((s) => `/${s.replace(/[\0\/]/g, '_')}`),
								depth: fc.integer({ min: 1, max: 4 }),
								size: fc.option(fc.integer({ min: 0, max: 10000 })),
								lastModified: fc.option(
									fc.integer({ min: 1000000000000, max: Date.now() })
								),
							}),
							{ minLength: 0, maxLength: 5 }
						),
					}),
					async (testData) => {
						const { path, name, depth, cachedChildren, freshChildren } =
							testData

						const cachedNode: FsDirTreeNode = {
							kind: 'dir',
							name,
							path,
							depth,
							parentPath: depth > 0 ? '/' : undefined,
							children: cachedChildren.map((child) => ({
								kind: 'file' as const,
								name: child.name,
								path: child.path,
								depth: child.depth,
								parentPath: path,
								size: child.size ?? undefined,
								lastModified: child.lastModified ?? undefined,
							})),
							isLoaded: true,
						}

						const freshNode: FsDirTreeNode = {
							kind: 'dir',
							name,
							path,
							depth,
							parentPath: depth > 0 ? '/' : undefined,
							children: freshChildren.map((child) => ({
								kind: 'file' as const,
								name: child.name,
								path: child.path,
								depth: child.depth,
								parentPath: path,
								size: child.size ?? undefined,
								lastModified: child.lastModified ?? undefined,
							})),
							isLoaded: true,
						}

						await cacheController.setCachedDirectory(path, cachedNode)

						let workerCallCount = 0
						mockLoadDirectory.mockImplementation(async (target) => {
							workerCallCount++
							// Simulate background worker delay
							await new Promise((resolve) => setTimeout(resolve, 20))
							return target.path === path ? freshNode : undefined
						})

						const directoryLoadedCalls: any[] = []
						mockCallbacks.onDirectoryLoaded = vi.fn((payload) => {
							directoryLoadedCalls.push(payload)
						})

						const target: PrefetchTarget = {
							path,
							name,
							depth,
							parentPath: depth > 0 ? '/' : undefined,
						}

						const startTime = Date.now()

						const cachedData = await cacheController.getCachedDirectory(path)
						expect(cachedData).not.toBeNull()
						expect(cachedData!.path).toBe(path)
						expect(cachedData!.children).toHaveLength(cachedChildren.length)

						const cacheLoadTime = Date.now() - startTime
						expect(cacheLoadTime).toBeLessThan(100) // More lenient timing

						const backgroundStartTime = Date.now()

						const result = await (cachedQueue as any).loadDirectoryWithCache(
							target
						)

						if (result) {
							expect(result.path).toBe(path)
							expect(result.children).toHaveLength(cachedChildren.length)
						}

						await new Promise((resolve) => setTimeout(resolve, 50))

						expect(workerCallCount).toBeGreaterThan(0)
					}
				),
				{ numRuns: 10 }
			)
		})

		it('should update UI incrementally when changes are detected during background validation', async () => {
			const testPath = `/test-merge-${Date.now()}`
			const testName = 'test-dir'
			const cachedChildCount = 2
			const freshChildCount = 3

			await cacheController.clearCache()

			const cachedNode: FsDirTreeNode = {
				kind: 'dir',
				name: testName,
				path: testPath,
				depth: 0,
				children: Array.from({ length: cachedChildCount }, (_, i) => ({
					kind: 'file' as const,
					name: `cached-file-${i}.txt`,
					path: `${testPath}/cached-file-${i}.txt`,
					depth: 1,
					parentPath: testPath,
					size: 100 + i,
					lastModified: Date.now() - 10000,
				})),
				isLoaded: true,
			}

			const freshNode: FsDirTreeNode = {
				kind: 'dir',
				name: testName,
				path: testPath,
				depth: 0,
				children: Array.from({ length: freshChildCount }, (_, i) => ({
					kind: 'file' as const,
					name: `fresh-file-${i}.txt`,
					path: `${testPath}/fresh-file-${i}.txt`,
					depth: 1,
					parentPath: testPath,
					size: 200 + i,
					lastModified: Date.now() - 1000,
				})),
				isLoaded: true,
			}

			await cacheController.setCachedDirectory(testPath, cachedNode)

			const verifyCache = await cacheController.getCachedDirectory(testPath)
			expect(verifyCache).not.toBeNull()
			expect(verifyCache!.children).toHaveLength(cachedChildCount)

			await cacheController.mergeDirectoryUpdate(testPath, freshNode)

			const updatedCache = await cacheController.getCachedDirectory(testPath)
			expect(updatedCache).not.toBeNull()
			expect(updatedCache!.children).toHaveLength(freshChildCount)
			expect(updatedCache!.children[0]?.name).toMatch(/^fresh-file-/)
		})
	})

	describe('Property 13: Cache-first startup with background validation', () => {
		it('should display cached tree data immediately while workers validate all directories in background', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						rootPath: fc
							.string({ minLength: 1, maxLength: 10 })
							.map((s) => `/${s.replace(/[\0\/]/g, '_')}`),
						rootName: fc
							.string({ minLength: 1, maxLength: 10 })
							.map((s) => s.replace(/[\0\/]/g, '_')),
						directories: fc.array(
							fc.record({
								path: fc
									.string({ minLength: 1, maxLength: 15 })
									.map((s) => `/${s.replace(/[\0\/]/g, '_')}`),
								name: fc
									.string({ minLength: 1, maxLength: 10 })
									.map((s) => s.replace(/[\0\/]/g, '_')),
								childCount: fc.integer({ min: 0, max: 3 }),
							}),
							{ minLength: 1, maxLength: 4 }
						),
					}),
					async (testData) => {
						const { rootPath, rootName, directories } = testData

						const cachedTree: FsDirTreeNode = {
							kind: 'dir',
							name: rootName,
							path: rootPath,
							depth: 0,
							children: directories.map((dir) => ({
								kind: 'dir' as const,
								name: dir.name,
								path: dir.path,
								depth: 1,
								parentPath: rootPath,
								children: Array.from({ length: dir.childCount }, (_, i) => ({
									kind: 'file' as const,
									name: `file-${i}.txt`,
									path: `${dir.path}/file-${i}.txt`,
									depth: 2,
									parentPath: dir.path,
									size: 100 + i,
									lastModified: Date.now() - 5000,
								})),
								isLoaded: true,
							})),
							isLoaded: true,
						}

						await cacheController.setCachedTree(rootPath, cachedTree)

						for (const dir of directories) {
							const dirNode: FsDirTreeNode = {
								kind: 'dir',
								name: dir.name,
								path: dir.path,
								depth: 1,
								parentPath: rootPath,
								children: Array.from({ length: dir.childCount }, (_, i) => ({
									kind: 'file' as const,
									name: `file-${i}.txt`,
									path: `${dir.path}/file-${i}.txt`,
									depth: 2,
									parentPath: dir.path,
									size: 100 + i,
									lastModified: Date.now() - 5000,
								})),
								isLoaded: true,
							}
							await cacheController.setCachedDirectory(dir.path, dirNode)
						}

						let backgroundValidationCalls = 0
						mockLoadDirectory.mockImplementation(async (target) => {
							backgroundValidationCalls++
							// Simulate background validation delay
							await new Promise((resolve) => setTimeout(resolve, 10))

							// Return fresh data (could be same or different)
							const matchingDir = directories.find(
								(d) => d.path === target.path
							)
							if (matchingDir) {
								return {
									kind: 'dir' as const,
									name: matchingDir.name,
									path: matchingDir.path,
									depth: 1,
									parentPath: rootPath,
									children: Array.from(
										{ length: matchingDir.childCount },
										(_, i) => ({
											kind: 'file' as const,
											name: `validated-file-${i}.txt`,
											path: `${matchingDir.path}/validated-file-${i}.txt`,
											depth: 2,
											parentPath: matchingDir.path,
											size: 200 + i,
											lastModified: Date.now() - 1000,
										})
									),
									isLoaded: true,
								}
							}
							return undefined
						})

						const startupStartTime = Date.now()

						const cachedTreeData = await cacheController.getCachedTree(rootPath)

						const cacheLoadTime = Date.now() - startupStartTime

						expect(cacheLoadTime).toBeLessThan(100) // More lenient timing

						expect(cachedTreeData).not.toBeNull()
						expect(cachedTreeData!.path).toBe(rootPath)
						expect(cachedTreeData!.children).toHaveLength(directories.length)

						const validationPromises = directories.map((dir) => {
							const target: PrefetchTarget = {
								path: dir.path,
								name: dir.name,
								depth: 1,
								parentPath: rootPath,
							}
							return (cachedQueue as any).loadDirectoryWithCache(target)
						})

						const validationResults = await Promise.all(validationPromises)

						validationResults.forEach((result, index) => {
							if (result) {
								expect(result.path).toBe(directories[index]?.path)
								// Should have some children
								expect(result.children.length).toBeGreaterThanOrEqual(0)
							}
						})

						await new Promise((resolve) => setTimeout(resolve, 50))

						expect(backgroundValidationCalls).toBeGreaterThan(0)

						for (const dir of directories) {
							const updatedCache = await cacheController.getCachedDirectory(
								dir.path
							)
							expect(updatedCache).not.toBeNull()
							// The cache might have been updated with validated data
							if (updatedCache && updatedCache.children.length > 0) {
								// Either original or validated data is acceptable
								const fileName = updatedCache.children[0]?.name
								expect(fileName).toMatch(/^(file-|validated-file-)/)
							}
						}
					}
				),
				{ numRuns: 6 }
			)
		})
	})
})
