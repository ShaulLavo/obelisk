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

interface CachedPrefetchQueueWithPrivates {
	loadDirectoryWithCache(
		target: PrefetchTarget
	): Promise<FsDirTreeNode | undefined>
}

describe('IncrementalUpdates', () => {
	let cacheController: TreeCacheController
	let cachedQueue: CachedPrefetchQueue
	let mockCallbacks: TreePrefetchWorkerCallbacks
	let mockLoadDirectory: MockedFunction<
		(target: PrefetchTarget) => Promise<FsDirTreeNode | undefined>
	>
	const testDbName = `test-incremental-${Date.now()}-${Math.random().toString(36).substring(7)}`

	beforeEach(() => {
		cacheController = new TreeCacheController({
			dbName: testDbName,
			storeName: 'test-incremental',
		})

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
			// no-op
		}
	})

	describe('Property 11: Incremental update scope', () => {
		it('should rescan only changed directory and immediate children while preserving cached data for unchanged directories', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						rootPath: fc
							.string({ minLength: 1, maxLength: 10 })
							.map((s) => `/${s.replace(/[\0/]/g, '_')}`),
						rootName: fc
							.string({ minLength: 1, maxLength: 8 })
							.map((s) => s.replace(/[\0/]/g, '_')),
						unchangedDirs: fc.array(
							fc.record({
								name: fc
									.string({ minLength: 1, maxLength: 8 })
									.map((s) => s.replace(/[\0/]/g, '_')),
								childCount: fc.integer({ min: 1, max: 3 }),
							}),
							{ minLength: 2, maxLength: 4 }
						),
						changedDir: fc
							.record({
								name: fc
									.string({ minLength: 1, maxLength: 8 })
									.map((s) => s.replace(/[\0/]/g, '_')),
								originalChildCount: fc.integer({ min: 1, max: 3 }),
								newChildCount: fc.integer({ min: 1, max: 5 }),
							})
							.filter((dir) => dir.originalChildCount !== dir.newChildCount),
					}),
					async (testData) => {
						const { rootPath, rootName, unchangedDirs, changedDir } = testData

						const unchangedPaths = unchangedDirs.map(
							(dir) => `${rootPath}/${dir.name}`
						)
						const changedPath = `${rootPath}/${changedDir.name}`
						const allDirPaths = [...unchangedPaths, changedPath]

						const createDirectoryNode = (
							path: string,
							name: string,
							childCount: number
						): FsDirTreeNode => ({
							kind: 'dir',
							name,
							path,
							depth: path === rootPath ? 0 : 1,
							parentPath: path === rootPath ? undefined : rootPath,
							children: Array.from({ length: childCount }, (_, i) => ({
								kind: 'file' as const,
								name: `file-${i}.txt`,
								path: `${path}/file-${i}.txt`,
								depth: path === rootPath ? 1 : 2,
								parentPath: path,
								size: 100 + i,
								lastModified: Date.now() - 10000,
							})),
							isLoaded: true,
						})

						const rootNode = createDirectoryNode(rootPath, rootName, 0)
						rootNode.children = allDirPaths.map((dirPath) => {
							const dirName = dirPath.split('/').pop() || 'unknown'
							const childCount =
								dirPath === changedPath
									? changedDir.originalChildCount
									: unchangedDirs.find((d) => dirPath.endsWith(d.name))
											?.childCount || 1
							return createDirectoryNode(dirPath, dirName, childCount)
						})

						await cacheController.setCachedTree(rootPath, rootNode)

						for (let i = 0; i < allDirPaths.length; i++) {
							const dirPath = allDirPaths[i]!
							const dirName = dirPath.split('/').pop() || 'unknown'
							const childCount =
								dirPath === changedPath
									? changedDir.originalChildCount
									: unchangedDirs.find((d) => dirPath.endsWith(d.name))
											?.childCount || 1
							const dirNode = createDirectoryNode(dirPath, dirName, childCount)
							await cacheController.setCachedDirectory(dirPath, dirNode)
						}

						const scannedDirectories = new Set<string>()
						const scanResults = new Map<string, FsDirTreeNode>()

						mockLoadDirectory.mockImplementation(
							async (target: PrefetchTarget) => {
								scannedDirectories.add(target.path)

								if (target.path === changedPath) {
									const freshNode = createDirectoryNode(
										target.path,
										target.name,
										changedDir.newChildCount
									)
									freshNode.children = Array.from(
										{ length: changedDir.newChildCount },
										(_, i) => ({
											kind: 'file' as const,
											name: `fresh-file-${i}.txt`,
											path: `${target.path}/fresh-file-${i}.txt`,
											depth: 2,
											parentPath: target.path,
											size: 200 + i,
											lastModified: Date.now() - 1000,
										})
									)
									scanResults.set(target.path, freshNode)
									return freshNode
								}

								const unchangedDir = unchangedDirs.find((d) =>
									target.path.endsWith(d.name)
								)
								if (unchangedDir) {
									const unchangedNode = createDirectoryNode(
										target.path,
										target.name,
										unchangedDir.childCount
									)
									scanResults.set(target.path, unchangedNode)
									return unchangedNode
								}

								return undefined
							}
						)

						for (const dirPath of allDirPaths) {
							const cached = await cacheController.getCachedDirectory(dirPath)
							expect(cached).not.toBeNull()
						}

						await cacheController.markDirectoryStale(changedPath)

						const changedCached =
							await cacheController.getCachedDirectory(changedPath)
						expect(changedCached).toBeNull()

						const changedTarget: PrefetchTarget = {
							path: changedPath,
							name: changedDir.name,
							depth: 1,
							parentPath: rootPath,
						}

						const result = await (
							cachedQueue as unknown as CachedPrefetchQueueWithPrivates
						).loadDirectoryWithCache(changedTarget)

						expect(scannedDirectories.has(changedPath)).toBe(true)
						expect(result).not.toBeNull()
						expect(result!.path).toBe(changedPath)
						expect(result!.children).toHaveLength(changedDir.newChildCount)

						for (const unchangedPath of unchangedPaths) {
							expect(scannedDirectories.has(unchangedPath)).toBe(false)

							const unchangedCached =
								await cacheController.getCachedDirectory(unchangedPath)
							expect(unchangedCached).not.toBeNull()

							const expectedChildCount =
								unchangedDirs.find((d) => unchangedPath.endsWith(d.name))
									?.childCount || 1
							expect(unchangedCached!.children).toHaveLength(expectedChildCount)

							if (unchangedCached!.children.length > 0) {
								expect(unchangedCached!.children[0]?.name).toMatch(/^file-/)
							}
						}

						const updatedChangedCache =
							await cacheController.getCachedDirectory(changedPath)
						expect(updatedChangedCache).not.toBeNull()
						expect(updatedChangedCache!.children).toHaveLength(
							changedDir.newChildCount
						)
						if (updatedChangedCache!.children.length > 0) {
							expect(updatedChangedCache!.children[0]?.name).toMatch(
								/^fresh-file-/
							)
						}

						expect(scannedDirectories.size).toBe(1)
						expect(scannedDirectories.has(changedPath)).toBe(true)

						for (const unchangedPath of unchangedPaths) {
							const cached =
								await cacheController.getCachedDirectory(unchangedPath)
							expect(cached).not.toBeNull()
							expect(cached!.children[0]?.name).toMatch(/^file-/)
						}
					}
				),
				{ numRuns: 8 }
			)
		})

		it('should preserve cached data for unchanged directories during incremental updates', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						rootPath: fc
							.string({ minLength: 1, maxLength: 8 })
							.map((s) => `/${s.replace(/[\0/]/g, '_')}`),
						directories: fc
							.array(
								fc.record({
									name: fc
										.string({ minLength: 1, maxLength: 6 })
										.map((s) => s.replace(/[\0/]/g, '_')),
									childCount: fc.integer({ min: 1, max: 3 }),
									shouldChange: fc.boolean(),
								}),
								{ minLength: 3, maxLength: 5 }
							)
							.filter(
								(dirs) =>
									dirs.some((d) => d.shouldChange) &&
									dirs.some((d) => !d.shouldChange)
							),
					}),
					async (testData) => {
						const { rootPath, directories } = testData

						const changedDirs = directories.filter((d) => d.shouldChange)
						const unchangedDirs = directories.filter((d) => !d.shouldChange)

						for (const dir of directories) {
							const dirPath = `${rootPath}/${dir.name}`
							const dirNode: FsDirTreeNode = {
								kind: 'dir',
								name: dir.name,
								path: dirPath,
								depth: 1,
								parentPath: rootPath,
								children: Array.from({ length: dir.childCount }, (_, i) => ({
									kind: 'file' as const,
									name: `original-${i}.txt`,
									path: `${dirPath}/original-${i}.txt`,
									depth: 2,
									parentPath: dirPath,
									size: 100 + i,
									lastModified: Date.now() - 10000,
								})),
								isLoaded: true,
							}
							await cacheController.setCachedDirectory(dirPath, dirNode)
						}

						const scannedPaths = new Set<string>()

						mockLoadDirectory.mockImplementation(
							async (target: PrefetchTarget) => {
								scannedPaths.add(target.path)

								const dir = directories.find((d) =>
									target.path.endsWith(d.name)
								)
								if (dir && dir.shouldChange) {
									return {
										kind: 'dir' as const,
										name: dir.name,
										path: target.path,
										depth: 1,
										parentPath: rootPath,
										children: Array.from(
											{ length: dir.childCount + 1 },
											(_, i) => ({
												kind: 'file' as const,
												name: `updated-${i}.txt`,
												path: `${target.path}/updated-${i}.txt`,
												depth: 2,
												parentPath: target.path,
												size: 200 + i,
												lastModified: Date.now() - 1000,
											})
										),
										isLoaded: true,
									}
								}

								if (dir && !dir.shouldChange) {
									return {
										kind: 'dir' as const,
										name: dir.name,
										path: target.path,
										depth: 1,
										parentPath: rootPath,
										children: Array.from(
											{ length: dir.childCount },
											(_, i) => ({
												kind: 'file' as const,
												name: `original-${i}.txt`,
												path: `${target.path}/original-${i}.txt`,
												depth: 2,
												parentPath: target.path,
												size: 100 + i,
												lastModified: Date.now() - 10000,
											})
										),
										isLoaded: true,
									}
								}

								return undefined
							}
						)

						for (const dir of changedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							await cacheController.markDirectoryStale(dirPath)
						}

						for (const dir of changedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)
							expect(cached).toBeNull()
						}

						for (const dir of unchangedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)
							expect(cached).not.toBeNull()
							expect(cached!.children).toHaveLength(dir.childCount)
							expect(cached!.children[0]?.name).toMatch(/^original-/)
						}

						for (const dir of changedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const target: PrefetchTarget = {
								path: dirPath,
								name: dir.name,
								depth: 1,
								parentPath: rootPath,
							}
							await (
								cachedQueue as unknown as CachedPrefetchQueueWithPrivates
							).loadDirectoryWithCache(target)
						}

						expect(scannedPaths.size).toBe(changedDirs.length)
						for (const dir of changedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							expect(scannedPaths.has(dirPath)).toBe(true)
						}

						for (const dir of unchangedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							expect(scannedPaths.has(dirPath)).toBe(false)
						}

						for (const dir of unchangedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)
							expect(cached).not.toBeNull()
							expect(cached!.children).toHaveLength(dir.childCount)
							expect(cached!.children[0]?.name).toMatch(/^original-/)
						}

						for (const dir of changedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)
							expect(cached).not.toBeNull()
							expect(cached!.children).toHaveLength(dir.childCount + 1)
							expect(cached!.children[0]?.name).toMatch(/^updated-/)
						}
					}
				),
				{ numRuns: 6 }
			)
		})
	})

	describe('Property 12: Tree structure consistency during updates', () => {
		it('should maintain valid parent-child relationships and proper data merging during incremental updates', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						rootPath: fc
							.string({ minLength: 1, maxLength: 8 })
							.map((s) => `/${s.replace(/[\0/]/g, '_')}`),
						rootName: fc
							.string({ minLength: 1, maxLength: 6 })
							.map((s) => s.replace(/[\0/]/g, '_')),
						treeStructure: fc
							.array(
								fc.record({
									name: fc
										.string({ minLength: 1, maxLength: 6 })
										.map((s) => s.replace(/[\0/]/g, '_')),
									children: fc.array(
										fc.record({
											name: fc
												.string({ minLength: 1, maxLength: 6 })
												.map((s) => s.replace(/[\0/]/g, '_')),
											isDir: fc.boolean(),
										}),
										{ minLength: 1, maxLength: 3 }
									),
									shouldUpdate: fc.boolean(),
								}),
								{ minLength: 2, maxLength: 4 }
							)
							.filter((dirs) => dirs.some((d) => d.shouldUpdate)),
					}),
					async (testData) => {
						const { rootPath, rootName, treeStructure } = testData

						const createTreeNode = (
							name: string,
							path: string,
							depth: number,
							parentPath: string | undefined,
							children: Array<{ name: string; isDir: boolean }>
						): FsDirTreeNode => ({
							kind: 'dir',
							name,
							path,
							depth,
							parentPath,
							children: children.map((child) => {
								const childPath = `${path}/${child.name}`
								if (child.isDir) {
									return {
										kind: 'dir' as const,
										name: child.name,
										path: childPath,
										depth: depth + 1,
										parentPath: path,
										children: [],
										isLoaded: true,
									}
								} else {
									return {
										kind: 'file' as const,
										name: child.name,
										path: childPath,
										depth: depth + 1,
										parentPath: path,
										size: 100,
										lastModified: Date.now() - 5000,
									}
								}
							}),
							isLoaded: true,
						})

						const rootNode = createTreeNode(
							rootName,
							rootPath,
							0,
							undefined,
							[]
						)
						rootNode.children = treeStructure.map((dir) =>
							createTreeNode(
								dir.name,
								`${rootPath}/${dir.name}`,
								1,
								rootPath,
								dir.children
							)
						)

						await cacheController.setCachedTree(rootPath, rootNode)

						for (const dir of treeStructure) {
							const dirPath = `${rootPath}/${dir.name}`
							const dirNode = createTreeNode(
								dir.name,
								dirPath,
								1,
								rootPath,
								dir.children
							)
							await cacheController.setCachedDirectory(dirPath, dirNode)
						}

						const updatedDirectories = new Map<string, FsDirTreeNode>()

						mockLoadDirectory.mockImplementation(
							async (target: PrefetchTarget) => {
								const dir = treeStructure.find((d) =>
									target.path.endsWith(d.name)
								)
								if (!dir || !dir.shouldUpdate) {
									return undefined
								}

								const updatedChildren = [
									...dir.children,
									{ name: `new-child-${Date.now()}`, isDir: false },
								]

								const updatedNode = createTreeNode(
									dir.name,
									target.path,
									target.depth,
									target.parentPath,
									updatedChildren
								)

								updatedDirectories.set(target.path, updatedNode)
								return updatedNode
							}
						)

						const updatePromises = treeStructure
							.filter((dir) => dir.shouldUpdate)
							.map(async (dir) => {
								const dirPath = `${rootPath}/${dir.name}`

								await cacheController.markDirectoryStale(dirPath)

								const target: PrefetchTarget = {
									path: dirPath,
									name: dir.name,
									depth: 1,
									parentPath: rootPath,
								}

								return (
									cachedQueue as unknown as CachedPrefetchQueueWithPrivates
								).loadDirectoryWithCache(target)
							})

						const updateResults = await Promise.all(updatePromises)

						for (const result of updateResults) {
							if (!result) continue

							expect(result.parentPath).toBe(rootPath)
							expect(result.depth).toBe(1)

							for (const child of result.children) {
								expect(child.parentPath).toBe(result.path)
								expect(child.depth).toBe(result.depth + 1)
								expect(child.path).toMatch(
									new RegExp(
										`^${result.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`
									)
								)
							}

							const originalDir = treeStructure.find((d) =>
								result.path.endsWith(d.name)
							)
							if (originalDir && originalDir.shouldUpdate) {
								expect(result.children.length).toBe(
									originalDir.children.length + 1
								)
							}
						}

						for (const dir of treeStructure.filter((d) => !d.shouldUpdate)) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)

							expect(cached).not.toBeNull()
							expect(cached!.parentPath).toBe(rootPath)
							expect(cached!.depth).toBe(1)
							expect(cached!.children.length).toBe(dir.children.length)

							for (const child of cached!.children) {
								expect(child.parentPath).toBe(dirPath)
								expect(child.depth).toBe(2)
							}
						}

						for (const dir of treeStructure.filter((d) => d.shouldUpdate)) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)

							expect(cached).not.toBeNull()
							expect(cached!.parentPath).toBe(rootPath)
							expect(cached!.depth).toBe(1)
							expect(cached!.children.length).toBe(dir.children.length + 1)

							for (const child of cached!.children) {
								expect(child.parentPath).toBe(dirPath)
								expect(child.depth).toBe(2)
								expect(child.path).toMatch(
									new RegExp(
										`^${dirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`
									)
								)
							}
						}

						const rootCached = await cacheController.getCachedTree(rootPath)
						if (rootCached) {
							expect(rootCached.depth).toBe(0)
							expect(rootCached.parentPath).toBeUndefined()

							for (const child of rootCached.children) {
								expect(child.parentPath).toBe(rootPath)
								expect(child.depth).toBe(1)
							}
						}
					}
				),
				{ numRuns: 8 }
			)
		})

		it('should properly merge new data with existing cached siblings during incremental updates', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.record({
						rootPath: fc
							.string({ minLength: 1, maxLength: 8 })
							.map((s) => `/${s.replace(/[\0/]/g, '_')}`),
						siblingDirs: fc
							.array(
								fc.record({
									name: fc
										.string({ minLength: 1, maxLength: 6 })
										.map((s) => s.replace(/[\0/]/g, '_')),
									originalFiles: fc.array(
										fc
											.string({ minLength: 1, maxLength: 6 })
											.map((s) => s.replace(/[\0/]/g, '_')),
										{ minLength: 1, maxLength: 3 }
									),
									shouldUpdate: fc.boolean(),
								}),
								{ minLength: 3, maxLength: 5 }
							)
							.filter(
								(dirs) =>
									dirs.some((d) => d.shouldUpdate) &&
									dirs.some((d) => !d.shouldUpdate)
							),
					}),
					async (testData) => {
						const { rootPath, siblingDirs } = testData

						for (const dir of siblingDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const dirNode: FsDirTreeNode = {
								kind: 'dir',
								name: dir.name,
								path: dirPath,
								depth: 1,
								parentPath: rootPath,
								children: dir.originalFiles.map((fileName) => ({
									kind: 'file' as const,
									name: `${fileName}.txt`,
									path: `${dirPath}/${fileName}.txt`,
									depth: 2,
									parentPath: dirPath,
									size: 100,
									lastModified: Date.now() - 5000,
								})),
								isLoaded: true,
							}
							await cacheController.setCachedDirectory(dirPath, dirNode)
						}

						mockLoadDirectory.mockImplementation(
							async (target: PrefetchTarget) => {
								const dir = siblingDirs.find((d) =>
									target.path.endsWith(d.name)
								)
								if (!dir || !dir.shouldUpdate) {
									return undefined
								}

								const updatedFiles = [
									...dir.originalFiles,
									`merged-${Date.now()}`,
									`updated-${Math.random().toString(36).substring(7)}`,
								]

								return {
									kind: 'dir' as const,
									name: dir.name,
									path: target.path,
									depth: 1,
									parentPath: rootPath,
									children: updatedFiles.map((fileName) => ({
										kind: 'file' as const,
										name: `${fileName}.txt`,
										path: `${target.path}/${fileName}.txt`,
										depth: 2,
										parentPath: target.path,
										size: 150,
										lastModified: Date.now() - 1000,
									})),
									isLoaded: true,
								}
							}
						)

						const updatedDirs = siblingDirs.filter((d) => d.shouldUpdate)
						const unchangedDirs = siblingDirs.filter((d) => !d.shouldUpdate)

						for (const dir of updatedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							await cacheController.markDirectoryStale(dirPath)

							const target: PrefetchTarget = {
								path: dirPath,
								name: dir.name,
								depth: 1,
								parentPath: rootPath,
							}

							await (
								cachedQueue as unknown as CachedPrefetchQueueWithPrivates
							).loadDirectoryWithCache(target)
						}

						for (const dir of updatedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)

							expect(cached).not.toBeNull()
							expect(cached!.children.length).toBeGreaterThan(
								dir.originalFiles.length
							)

							const fileNames = cached!.children.map((child) => child.name)
							const hasOriginalFiles = dir.originalFiles.some((fileName) =>
								fileNames.some((name) => name.includes(fileName))
							)
							const hasNewFiles = fileNames.some(
								(name) => name.includes('merged-') || name.includes('updated-')
							)

							expect(hasOriginalFiles).toBe(true)
							expect(hasNewFiles).toBe(true)
						}

						for (const dir of unchangedDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)

							expect(cached).not.toBeNull()
							expect(cached!.children.length).toBe(dir.originalFiles.length)

							const fileNames = cached!.children.map((child) => child.name)
							const hasOnlyOriginalFiles = dir.originalFiles.every((fileName) =>
								fileNames.some((name) => name.includes(fileName))
							)
							const hasNoNewFiles = !fileNames.some(
								(name) => name.includes('merged-') || name.includes('updated-')
							)

							expect(hasOnlyOriginalFiles).toBe(true)
							expect(hasNoNewFiles).toBe(true)
						}

						for (const dir of siblingDirs) {
							const dirPath = `${rootPath}/${dir.name}`
							const cached = await cacheController.getCachedDirectory(dirPath)

							expect(cached).not.toBeNull()
							expect(cached!.parentPath).toBe(rootPath)
							expect(cached!.depth).toBe(1)

							for (const child of cached!.children) {
								expect(child.parentPath).toBe(dirPath)
								expect(child.depth).toBe(2)
								expect(child.path).toMatch(
									new RegExp(
										`^${dirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`
									)
								)
							}
						}
					}
				),
				{ numRuns: 6 }
			)
		})

		it('should propagate directory count and metadata changes up the tree hierarchy during updates', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc
						.record({
							rootPath: fc
								.string({ minLength: 1, maxLength: 8 })
								.map((s) => `/${s.replace(/[\0/\s]/g, '_')}`),
							nestedStructure: fc.record({
								level1Name: fc
									.string({ minLength: 1, maxLength: 6 })
									.map((s) => s.replace(/[\0/\s]/g, '_')),
								level2Name: fc
									.string({ minLength: 1, maxLength: 6 })
									.map((s) => s.replace(/[\0/\s]/g, '_')),
								level3Name: fc
									.string({ minLength: 1, maxLength: 6 })
									.map((s) => s.replace(/[\0/\s]/g, '_')),
								originalFileCount: fc.integer({ min: 1, max: 3 }),
								additionalFiles: fc.integer({ min: 1, max: 3 }),
							}),
						})
						.filter((data) => {
							const { rootPath, nestedStructure } = data
							const { level1Name, level2Name, level3Name } = nestedStructure
							return (
								rootPath.length > 1 &&
								level1Name.length > 0 &&
								level2Name.length > 0 &&
								level3Name.length > 0 &&
								!rootPath.includes('//') &&
								level1Name !== '_' &&
								level2Name !== '_' &&
								level3Name !== '_'
							)
						}),
					async (testData) => {
						const { rootPath, nestedStructure } = testData
						const {
							level1Name,
							level2Name,
							level3Name,
							originalFileCount,
							additionalFiles,
						} = nestedStructure

						const level1Path = `${rootPath}/${level1Name}`
						const level2Path = `${level1Path}/${level2Name}`
						const level3Path = `${level2Path}/${level3Name}`

						const createNestedNode = (
							path: string,
							name: string,
							depth: number,
							parentPath: string | undefined,
							fileCount: number
						): FsDirTreeNode => ({
							kind: 'dir',
							name,
							path,
							depth,
							parentPath,
							children: Array.from({ length: fileCount }, (_, i) => ({
								kind: 'file' as const,
								name: `file-${i}.txt`,
								path: `${path}/file-${i}.txt`,
								depth: depth + 1,
								parentPath: path,
								size: 100 + i,
								lastModified: Date.now() - 5000,
							})),
							isLoaded: true,
						})

						const level3Node = createNestedNode(
							level3Path,
							level3Name,
							3,
							level2Path,
							originalFileCount
						)
						const level2Node = createNestedNode(
							level2Path,
							level2Name,
							2,
							level1Path,
							0
						)
						level2Node.children = [level3Node]

						const level1Node = createNestedNode(
							level1Path,
							level1Name,
							1,
							rootPath,
							0
						)
						level1Node.children = [level2Node]

						await cacheController.setCachedDirectory(level3Path, level3Node)
						await cacheController.setCachedDirectory(level2Path, level2Node)
						await cacheController.setCachedDirectory(level1Path, level1Node)

						mockLoadDirectory.mockImplementation(
							async (target: PrefetchTarget) => {
								if (target.path === level3Path) {
									return createNestedNode(
										level3Path,
										level3Name,
										3,
										level2Path,
										originalFileCount + additionalFiles
									)
								}
								return undefined
							}
						)

						const originalLevel3 =
							await cacheController.getCachedDirectory(level3Path)
						expect(originalLevel3).not.toBeNull()
						expect(originalLevel3!.children.length).toBe(originalFileCount)

						await cacheController.markDirectoryStale(level3Path)

						const target: PrefetchTarget = {
							path: level3Path,
							name: level3Name,
							depth: 3,
							parentPath: level2Path,
						}

						const result = await (
							cachedQueue as unknown as CachedPrefetchQueueWithPrivates
						).loadDirectoryWithCache(target)

						expect(result).not.toBeNull()
						expect(result!.children.length).toBe(
							originalFileCount + additionalFiles
						)

						const updatedLevel3 =
							await cacheController.getCachedDirectory(level3Path)
						expect(updatedLevel3).not.toBeNull()
						expect(updatedLevel3!.children.length).toBe(
							originalFileCount + additionalFiles
						)

						const level2AfterUpdate =
							await cacheController.getCachedDirectory(level2Path)
						const level1AfterUpdate =
							await cacheController.getCachedDirectory(level1Path)

						if (level2AfterUpdate) {
							expect(level2AfterUpdate.parentPath).toBe(level1Path)
							expect(level2AfterUpdate.depth).toBe(2)
						}

						if (level1AfterUpdate) {
							expect(level1AfterUpdate.parentPath).toBe(rootPath)
							expect(level1AfterUpdate.depth).toBe(1)
						}

						expect(updatedLevel3!.parentPath).toBe(level2Path)
						expect(updatedLevel3!.depth).toBe(3)

						for (const child of updatedLevel3!.children) {
							expect(child.parentPath).toBe(level3Path)
							expect(child.depth).toBe(4)
						}
					}
				),
				{ numRuns: 6 }
			)
		})
	})
})
