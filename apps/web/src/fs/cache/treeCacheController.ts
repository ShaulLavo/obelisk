import localforage from 'localforage'
import type { FsDirTreeNode } from '@repo/fs'

export const CACHE_KEY_SCHEMA = {
	root: (source: string) => `v1:tree:root:${source}`,
	dir: (path: string) => `v1:tree:dir:${path}`,
	meta: (path: string) => `v1:tree:meta:${path}`,
} as const

export interface CachedChildEntry {
	kind: 'file' | 'dir'
	name: string
	path: string
	depth: number
	parentPath?: string
	size?: number
	lastModified?: number
	isLoaded?: boolean
}

export interface CachedDirectoryEntry {
	path: string
	name: string
	depth: number
	parentPath?: string
	cachedAt: number
	lastModified?: number
	version: number
	children: CachedChildEntry[]
	isLoaded: boolean
	checksum?: string
}

/**
 * Statistics and metrics for cache performance monitoring
 */
export interface TreeCacheStats {
	totalEntries: number
	totalSizeBytes: number
	hitRate: number
	missRate: number
	averageLoadTime: number
	cacheValidationTime: number
	indexedDBSize: number
	oldestEntry: number
	newestEntry: number
	batchWrites: number
	averageBatchWriteTime: number
}

export class TreeCacheController {
	private readonly store: LocalForage
	private readonly metadataStore: LocalForage
	private readonly version = 1

	private stats = {
		hits: 0,
		misses: 0,
		totalLoadTime: 0,
		validationTime: 0,
		batchWrites: 0,
		batchWriteTime: 0,
	}

	constructor(options: { dbName?: string; storeName?: string } = {}) {
		const dbName = options.dbName ?? 'tree-cache'
		const storeName = options.storeName ?? 'directories'

		this.store = localforage.createInstance({
			name: dbName,
			storeName: storeName,
			driver: [localforage.INDEXEDDB],
		})

		this.metadataStore = localforage.createInstance({
			name: dbName,
			storeName: `${storeName}_metadata`,
			driver: [localforage.INDEXEDDB],
		})
	}

	async getCachedTree(rootPath: string): Promise<FsDirTreeNode | null> {
		const startTime = performance.now()

		try {
			const key = CACHE_KEY_SCHEMA.root(rootPath)
			const cached = await this.store.getItem<CachedDirectoryEntry>(key)

			if (!cached) {
				this.stats.misses++
				return null
			}

			this.stats.hits++

			const fullTree = await this.loadFullTreeFromCache(cached)

			const loadTime = performance.now() - startTime
			this.stats.totalLoadTime += loadTime

			return fullTree
		} catch (_error) {
			this.stats.misses++
			return null
		}
	}

	/**
	 * Recursively load the full tree from cache, populating all directory children
	 */
	private async loadFullTreeFromCache(
		cached: CachedDirectoryEntry
	): Promise<FsDirTreeNode> {
		const children: Array<
			| {
					kind: 'file'
					name: string
					path: string
					depth: number
					parentPath?: string
					size?: number
					lastModified?: number
			  }
			| FsDirTreeNode
		> = []

		for (const child of cached.children) {
			if (child.kind === 'file') {
				children.push({
					kind: 'file' as const,
					name: child.name,
					path: child.path,
					depth: child.depth,
					parentPath: child.parentPath,
					size: child.size,
					lastModified: child.lastModified,
				})
			} else {
				const childKey = CACHE_KEY_SCHEMA.dir(child.path)
				const childCached =
					await this.store.getItem<CachedDirectoryEntry>(childKey)

				if (childCached) {
					const childTree = await this.loadFullTreeFromCache(childCached)
					children.push(childTree)
				} else {
					children.push({
						kind: 'dir' as const,
						name: child.name,
						path: child.path,
						depth: child.depth,
						parentPath: child.parentPath,
						children: [],
						isLoaded: false,
					})
				}
			}
		}

		return {
			kind: 'dir',
			name: cached.name,
			path: cached.path,
			depth: cached.depth,
			parentPath: cached.parentPath,
			children,
			isLoaded: cached.isLoaded,
		}
	}

	async setCachedTree(
		rootPath: string,
		tree: FsDirTreeNode,
		directoryMtime?: number
	): Promise<void> {
		try {
			const key = CACHE_KEY_SCHEMA.root(rootPath)
			const cached = this.convertTreeNodeToCached(tree, directoryMtime)

			await this.store.setItem(key, cached)
		} catch (_error) {
			// Failed to cache tree, continuing without caching
		}
	}

	async getCachedDirectory(path: string): Promise<FsDirTreeNode | null> {
		const startTime = performance.now()

		try {
			const key = CACHE_KEY_SCHEMA.dir(path)
			const cached = await this.store.getItem<CachedDirectoryEntry>(key)

			if (!cached) {
				this.stats.misses++
				return null
			}

			this.stats.hits++
			const loadTime = performance.now() - startTime
			this.stats.totalLoadTime += loadTime

			this.updateAccessTime(path, cached.cachedAt).catch(() => {
				// Failed to update access time
			})

			return this.convertCachedToTreeNode(cached)
		} catch (_error) {
			this.stats.misses++
			return null
		}
	}

	async setCachedDirectory(
		path: string,
		node: FsDirTreeNode,
		directoryMtime?: number
	): Promise<void> {
		try {
			const key = CACHE_KEY_SCHEMA.dir(path)
			const cached = this.convertTreeNodeToCached(node, directoryMtime)

			await this.store.setItem(key, cached)
		} catch (_error) {
			// Failed to cache directory, continuing without caching
		}
	}

	async invalidateDirectory(path: string): Promise<void> {
		try {
			const key = CACHE_KEY_SCHEMA.dir(path)
			await this.store.removeItem(key)
		} catch (_error) {
			// Failed to invalidate directory
		}
	}

	async invalidateSubtree(path: string): Promise<void> {
		try {
			const keys = await this.store.keys()
			const keysToRemove = keys.filter((key) => {
				if (typeof key !== 'string') return false

				if (key.startsWith('v1:tree:dir:')) {
					const keyPath = key.substring('v1:tree:dir:'.length)
					return keyPath === path || keyPath.startsWith(path + '/')
				}

				return false
			})

			await Promise.all(keysToRemove.map((key) => this.store.removeItem(key)))
		} catch (_error) {
			// Failed to invalidate subtree
		}
	}

	async clearCache(): Promise<void> {
		try {
			await this.store.clear()
			await this.metadataStore.clear()

			this.stats = {
				hits: 0,
				misses: 0,
				totalLoadTime: 0,
				validationTime: 0,
				batchWrites: 0,
				batchWriteTime: 0,
			}
		} catch (_error) {
			// Failed to clear cache
		}
	}

	async isDirectoryFresh(
		path: string,
		currentMtime?: number
	): Promise<boolean> {
		const startTime = performance.now()

		try {
			const key = CACHE_KEY_SCHEMA.dir(path)
			const cached = await this.store.getItem<CachedDirectoryEntry>(key)

			if (!cached) {
				return false
			}

			if (currentMtime === undefined) {
				return true
			}

			const isFresh =
				cached.lastModified !== undefined && cached.lastModified >= currentMtime

			const validationTime = performance.now() - startTime
			this.stats.validationTime += validationTime

			return isFresh
		} catch (_error) {
			return false
		}
	}

	async markDirectoryStale(path: string): Promise<void> {
		try {
			await this.invalidateDirectory(path)
			await this.invalidateAncestors(path)
		} catch (_error) {
			// Failed to mark directory stale
		}
	}

	/**
	 * Invalidate all ancestor directories of the given path
	 * This ensures hierarchical cache consistency when a directory changes
	 */
	async invalidateAncestors(path: string): Promise<void> {
		try {
			const ancestors = this.getAncestorPaths(path)
			const invalidationPromises = ancestors.map((ancestorPath) =>
				this.invalidateDirectory(ancestorPath)
			)

			await Promise.all(invalidationPromises)
		} catch (_error) {
			// Failed to invalidate ancestors
		}
	}

	/**
	 * Get all ancestor paths for a given directory path
	 * For example: "/src/components/Button" -> ["/src/components", "/src", "/"]
	 */
	private getAncestorPaths(path: string): string[] {
		const ancestors: string[] = []
		let currentPath = path

		while (currentPath !== '/' && currentPath !== '') {
			const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
			const normalizedParent = parentPath === '' ? '/' : parentPath

			if (normalizedParent !== currentPath) {
				ancestors.push(normalizedParent)
				currentPath = normalizedParent
			} else {
				break
			}
		}

		return ancestors
	}

	/**
	 * Enhanced freshness validation that compares modification times
	 * and automatically cleans up stale entries
	 */
	async validateAndCleanupStaleEntries(
		directoryMtimes: Map<string, number>
	): Promise<void> {
		const startTime = performance.now()

		try {
			const keys = await this.store.keys()
			const directoryKeys = keys.filter(
				(key) => typeof key === 'string' && key.startsWith('v1:tree:dir:')
			)

			const staleEntries: string[] = []

			for (const key of directoryKeys) {
				if (typeof key !== 'string') continue

				const path = key.substring('v1:tree:dir:'.length)
				const currentMtime = directoryMtimes.get(path)

				if (currentMtime !== undefined) {
					const isFresh = await this.isDirectoryFresh(path, currentMtime)
					if (!isFresh) {
						staleEntries.push(path)
					}
				}
			}

			if (staleEntries.length > 0) {
				const cleanupPromises = staleEntries.map((path) =>
					this.invalidateDirectory(path)
				)
				await Promise.all(cleanupPromises)
			}

			const validationTime = performance.now() - startTime
			this.stats.validationTime += validationTime
		} catch (_error) {
			// Failed to validate and cleanup stale entries
		}
	}

	/**
	 * Perform incremental update for a specific directory path
	 * Only rescans the target directory while preserving cached data for unchanged directories
	 */
	async performIncrementalUpdate(
		path: string,
		freshNode: FsDirTreeNode,
		directoryMtime?: number
	): Promise<void> {
		await this.setCachedDirectory(path, freshNode, directoryMtime)
		await this.updateParentChildRelationships(path, freshNode)
	}

	/**
	 * Update parent-child relationships to maintain tree consistency
	 */
	private async updateParentChildRelationships(
		path: string,
		updatedNode: FsDirTreeNode
	): Promise<void> {
		try {
			if (updatedNode.parentPath) {
				const parentCached = await this.getCachedDirectory(
					updatedNode.parentPath
				)
				if (parentCached) {
					const childIndex = parentCached.children.findIndex(
						(child) => child.path === path
					)

					if (childIndex >= 0) {
						parentCached.children[childIndex] = {
							kind: 'dir',
							name: updatedNode.name,
							path: updatedNode.path,
							depth: updatedNode.depth,
							parentPath: updatedNode.parentPath,
							children: [], // Parent only stores reference, not full children
							isLoaded: updatedNode.isLoaded,
						}

						await this.setCachedDirectory(parentCached.path, parentCached)
					}
				}
			}

			for (const child of updatedNode.children) {
				if (child.parentPath !== path) {
					child.parentPath = path
				}
			}
		} catch (_error) {
			// Failed to update parent-child relationships
		}
	}

	/**
	 * Merge fresh directory data with existing cached siblings
	 * Preserves cached data for unchanged directories while updating changed ones
	 */
	async mergeDirectoryUpdate(
		path: string,
		freshNode: FsDirTreeNode,
		directoryMtime?: number
	): Promise<void> {
		const existingCached = await this.getCachedDirectory(path)

		if (!existingCached) {
			await this.setCachedDirectory(path, freshNode, directoryMtime)
			return
		}

		const mergedNode: FsDirTreeNode = {
			...freshNode,
		}

		await this.setCachedDirectory(path, mergedNode, directoryMtime)
	}

	/**
	 * Get directories that need incremental updates based on modification times
	 */
	async getDirectoriesNeedingUpdate(
		directoryMtimes: Map<string, number>
	): Promise<string[]> {
		try {
			const keys = await this.store.keys()
			const directoryKeys = keys.filter(
				(key) => typeof key === 'string' && key.startsWith('v1:tree:dir:')
			)

			const staleDirectories: string[] = []

			for (const key of directoryKeys) {
				if (typeof key !== 'string') continue

				const path = key.substring('v1:tree:dir:'.length)
				const currentMtime = directoryMtimes.get(path)

				if (currentMtime !== undefined) {
					const isFresh = await this.isDirectoryFresh(path, currentMtime)
					if (!isFresh) {
						staleDirectories.push(path)
					}
				}
			}

			return staleDirectories
		} catch (_error) {
			return []
		}
	}

	/**
	 * Perform batch incremental updates for multiple directories
	 */
	async performBatchIncrementalUpdate(
		updates: Map<string, { node: FsDirTreeNode; mtime?: number }>
	): Promise<void> {
		const updatePromises: Promise<void>[] = []

		for (const [path, { node, mtime }] of updates) {
			updatePromises.push(this.performIncrementalUpdate(path, node, mtime))
		}

		await Promise.all(updatePromises)
	}

	/**
	 * Implement LRU eviction when storage quota is exceeded
	 */
	async evictLRUEntries(maxEntries: number): Promise<void> {
		try {
			const keys = await this.store.keys()
			const directoryKeys = keys.filter(
				(key) => typeof key === 'string' && key.startsWith('v1:tree:dir:')
			)

			if (directoryKeys.length <= maxEntries) {
				return // No eviction needed
			}

			const entriesWithTimestamps: Array<{
				key: string
				path: string
				cachedAt: number
			}> = []

			for (const key of directoryKeys) {
				if (typeof key !== 'string') continue

				try {
					const cached = await this.store.getItem<CachedDirectoryEntry>(key)
					if (cached) {
						const path = key.substring('v1:tree:dir:'.length)
						entriesWithTimestamps.push({
							key,
							path,
							cachedAt: cached.cachedAt,
						})
					}
				} catch (error) {
					// If we can't read an entry, consider it for eviction
					const path = key.substring('v1:tree:dir:'.length)
					entriesWithTimestamps.push({
						key,
						path,
						cachedAt: 0, // Oldest possible timestamp
					})
				}
			}

			entriesWithTimestamps.sort((a, b) => a.cachedAt - b.cachedAt)

			const entriesToEvict = entriesWithTimestamps.length - maxEntries
			const evictionPromises: Promise<void>[] = []

			for (let i = 0; i < entriesToEvict; i++) {
				const entry = entriesWithTimestamps[i]
				if (entry) {
					evictionPromises.push(this.invalidateDirectory(entry.path))
				}
			}

			await Promise.all(evictionPromises)
		} catch (_error) {
			// Graceful degradation - don't throw, system continues to work
		}
	}

	/**
	 * Update access time for LRU tracking when directory is accessed
	 */
	async updateAccessTime(path: string, cachedAt: number): Promise<void> {
		try {
			const key = CACHE_KEY_SCHEMA.dir(path)
			const currentCached = await this.store.getItem<CachedDirectoryEntry>(key)
			if (!currentCached || currentCached.cachedAt !== cachedAt) {
				return
			}

			currentCached.cachedAt = Date.now()
			await this.store.setItem(key, currentCached)
		} catch (_error) {
			// Graceful degradation - don't throw
		}
	}

	/**
	 * Handle corrupted cache data by detecting and cleaning up affected entries
	 */
	async handleCorruptedData(path: string): Promise<void> {
		try {
			await this.invalidateDirectory(path)
			await this.invalidateAncestors(path)
		} catch (_error) {
			// Graceful degradation - don't throw
		}
	}

	/**
	 * Lazy loading for large directory trees - loads children on demand
	 * Returns a directory node with only immediate children loaded
	 */
	async getCachedDirectoryLazy(
		path: string,
		maxChildrenToLoad: number = 100
	): Promise<FsDirTreeNode | null> {
		const startTime = performance.now()

		try {
			const key = CACHE_KEY_SCHEMA.dir(path)
			const cached = await this.store.getItem<CachedDirectoryEntry>(key)

			if (!cached) {
				this.stats.misses++
				return null
			}

			this.stats.hits++
			const loadTime = performance.now() - startTime
			this.stats.totalLoadTime += loadTime

			// Update access time for LRU tracking (don't await to avoid blocking)
			this.updateAccessTime(path, cached.cachedAt).catch(() => {
				// Failed to update access time
			})

			// Convert cached entry to tree node with lazy loading
			const treeNode = this.convertCachedToTreeNode(cached)

			// If directory has many children, only load the first batch
			if (treeNode.children.length > maxChildrenToLoad) {

				// Keep only the first batch of children
				const lazyChildren = treeNode.children.slice(0, maxChildrenToLoad)

				// Add a marker to indicate there are more children available
				const hasMoreChildren = treeNode.children.length > maxChildrenToLoad

				const lazyTreeNode: FsDirTreeNode = {
					...treeNode,
					children: lazyChildren,
					isLoaded: false,
				}

				// Store metadata about remaining children for future loading
				if (hasMoreChildren) {
					const remainingChildren = treeNode.children.slice(maxChildrenToLoad)
					await this.storeLazyLoadingMetadata(
						path,
						remainingChildren,
						maxChildrenToLoad
					)
				}

				return lazyTreeNode
			}

			return treeNode
		} catch (_error) {
			this.stats.misses++
			return null // Graceful degradation - return null to trigger filesystem fallback
		}
	}

	/**
	 * Load more children for a lazily loaded directory
	 */
	async loadMoreChildren(
		path: string,
		currentChildrenCount: number,
		batchSize: number = 100
	): Promise<FsDirTreeNode | null> {
		try {
			const metadata = await this.getLazyLoadingMetadata(path)
			if (!metadata) {
				return null
			}

			const startIndex = currentChildrenCount
			const endIndex = Math.min(startIndex + batchSize, metadata.totalChildren)
			const nextBatch = metadata.remainingChildren.slice(0, batchSize)

			if (nextBatch.length === 0) {
				return null
			}

			const currentNode = await this.getCachedDirectory(path)
			if (!currentNode) {
				return null
			}

			// Merge the next batch with current children
			const mappedNextBatch = nextBatch.map((child) => {
				if (child.kind === 'dir' && !child.children) {
					return { ...child, children: [] }
				}
				return child
			}) as unknown as FsDirTreeNode['children']

			const updatedChildren = [...currentNode.children, ...mappedNextBatch]
			const isFullyLoaded = endIndex >= metadata.totalChildren

			const updatedNode: FsDirTreeNode = {
				...currentNode,
				children: updatedChildren,
				isLoaded: isFullyLoaded,
			}

			await this.setCachedDirectory(path, updatedNode)

			if (!isFullyLoaded) {
				const remainingChildren = metadata.remainingChildren.slice(batchSize)
				await this.storeLazyLoadingMetadata(path, remainingChildren, endIndex)
			} else {
				// Remove lazy loading metadata when fully loaded
				await this.removeLazyLoadingMetadata(path)
			}

			return updatedNode
		} catch (_error) {
			return null
		}
	}

	/**
	 * Store metadata for lazy loading state
	 */
	private async storeLazyLoadingMetadata(
		path: string,
		remainingChildren: Array<{
			kind: 'file' | 'dir'
			name: string
			path: string
			depth: number
			parentPath?: string
			size?: number
			lastModified?: number
			isLoaded?: boolean
			children?: any[]
		}>,
		loadedCount: number
	): Promise<void> {
		try {
			const metaKey = CACHE_KEY_SCHEMA.meta(path)
			const metadata = {
				type: 'lazy-loading',
				totalChildren: loadedCount + remainingChildren.length,
				loadedChildren: loadedCount,
				remainingChildren,
				lastUpdated: Date.now(),
			}

			await this.metadataStore.setItem(metaKey, metadata)
		} catch (_error) {
			// Failed to store lazy loading metadata
		}
	}

	/**
	 * Get lazy loading metadata for a directory
	 */
	private async getLazyLoadingMetadata(path: string): Promise<{
		totalChildren: number
		loadedChildren: number
		remainingChildren: Array<{
			kind: 'file' | 'dir'
			name: string
			path: string
			depth: number
			parentPath?: string
			size?: number
			lastModified?: number
			isLoaded?: boolean
			children?: any[]
		}>
	} | null> {
		try {
			const metaKey = CACHE_KEY_SCHEMA.meta(path)
			const metadata = await this.metadataStore.getItem<any>(metaKey)

			if (!metadata || metadata.type !== 'lazy-loading') {
				return null
			}

			return {
				totalChildren: metadata.totalChildren,
				loadedChildren: metadata.loadedChildren,
				remainingChildren: metadata.remainingChildren,
			}
		} catch (_error) {
			return null
		}
	}

	/**
	 * Remove lazy loading metadata when directory is fully loaded
	 */
	private async removeLazyLoadingMetadata(path: string): Promise<void> {
		try {
			const metaKey = CACHE_KEY_SCHEMA.meta(path)
			await this.metadataStore.removeItem(metaKey)
		} catch (_error) {
			// Failed to remove lazy loading metadata
		}
	}

	/**
	 * Enhanced cache management operations with progress tracking
	 */
	async clearCacheWithProgress(
		onProgress?: (progress: {
			completed: number
			total: number
			currentOperation: string
		}) => void
	): Promise<void> {
		try {
			onProgress?.({
				completed: 0,
				total: 3,
				currentOperation: 'Getting cache keys...',
			})

			const keys = await this.store.keys()
			const metaKeys = await this.metadataStore.keys()
			const totalOperations = keys.length + metaKeys.length + 1 // +1 for stats reset

			onProgress?.({
				completed: 0,
				total: totalOperations,
				currentOperation: 'Clearing cache entries...',
			})

			// Clear main cache entries with progress
			for (let i = 0; i < keys.length; i++) {
				await this.store.removeItem(keys[i]!)
				onProgress?.({
					completed: i + 1,
					total: totalOperations,
					currentOperation: `Clearing cache entry ${i + 1}/${keys.length}...`,
				})
			}

			// Clear metadata entries with progress
			for (let i = 0; i < metaKeys.length; i++) {
				await this.metadataStore.removeItem(metaKeys[i]!)
				onProgress?.({
					completed: keys.length + i + 1,
					total: totalOperations,
					currentOperation: `Clearing metadata ${i + 1}/${metaKeys.length}...`,
				})
			}

			this.stats = {
				hits: 0,
				misses: 0,
				totalLoadTime: 0,
				validationTime: 0,
				batchWrites: 0,
				batchWriteTime: 0,
			}

			onProgress?.({
				completed: totalOperations,
				total: totalOperations,
				currentOperation: 'Cache cleared successfully',
			})
		} catch (error) {
			throw error
		}
	}

	/**
	 * Invalidate cache entries with progress tracking
	 */
	async invalidateSubtreeWithProgress(
		path: string,
		onProgress?: (progress: {
			completed: number
			total: number
			currentOperation: string
		}) => void
	): Promise<void> {
		try {
			onProgress?.({
				completed: 0,
				total: 1,
				currentOperation: 'Finding entries to invalidate...',
			})

			const keys = await this.store.keys()
			const keysToRemove = keys.filter((key) => {
				if (typeof key !== 'string') return false

				if (key.startsWith('v1:tree:dir:')) {
					const keyPath = key.substring('v1:tree:dir:'.length)
					return keyPath === path || keyPath.startsWith(path + '/')
				}

				return false
			})

			const totalOperations = keysToRemove.length
			onProgress?.({
				completed: 0,
				total: totalOperations,
				currentOperation: `Invalidating ${totalOperations} entries...`,
			})

			for (let i = 0; i < keysToRemove.length; i++) {
				await this.store.removeItem(keysToRemove[i]!)
				onProgress?.({
					completed: i + 1,
					total: totalOperations,
					currentOperation: `Invalidated ${i + 1}/${totalOperations} entries`,
				})
			}
		} catch (error) {
			throw error
		}
	}

	/**
	 * Automatic cleanup of cache entries older than the specified threshold with progress tracking
	 */
	async cleanupOldEntries(
		maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
		onProgress?: (progress: {
			completed: number
			total: number
			currentOperation: string
		}) => void
	): Promise<void> {
		const startTime = performance.now()
		const cutoffTime = Date.now() - maxAgeMs

		try {
			onProgress?.({
				completed: 0,
				total: 1,
				currentOperation: 'Scanning cache entries...',
			})

			const keys = await this.store.keys()
			const directoryKeys = keys.filter(
				(key) => typeof key === 'string' && key.startsWith('v1:tree:dir:')
			)

			onProgress?.({
				completed: 0,
				total: directoryKeys.length,
				currentOperation: 'Checking entry ages...',
			})

			const oldEntries: string[] = []

			// Check each cached directory's age with progress
			for (let i = 0; i < directoryKeys.length; i++) {
				const key = directoryKeys[i]
				if (typeof key !== 'string') continue

				try {
					const cached = await this.store.getItem<CachedDirectoryEntry>(key)
					if (cached && cached.cachedAt < cutoffTime) {
						const path = key.substring('v1:tree:dir:'.length)
						oldEntries.push(path)
					}
				} catch (error) {
					// If we can't read the entry, consider it for cleanup
					const path = key.substring('v1:tree:dir:'.length)
					oldEntries.push(path)
				}

				onProgress?.({
					completed: i + 1,
					total: directoryKeys.length,
					currentOperation: `Checked ${i + 1}/${directoryKeys.length} entries`,
				})
			}

			// Remove all old entries with progress
			if (oldEntries.length > 0) {
				onProgress?.({
					completed: 0,
					total: oldEntries.length,
					currentOperation: 'Removing old entries...',
				})

				for (let i = 0; i < oldEntries.length; i++) {
					await this.invalidateDirectory(oldEntries[i]!)
					onProgress?.({
						completed: i + 1,
						total: oldEntries.length,
						currentOperation: `Removed ${i + 1}/${oldEntries.length} old entries`,
					})
				}
			}
		} catch (error) {
			throw error
		}
	}

	/**
	 * Get cache size and storage information
	 */
	async getCacheSize(): Promise<{
		totalEntries: number
		estimatedSizeBytes: number
		oldestEntry: number
		newestEntry: number
	}> {
		try {
			const keys = await this.store.keys()
			const totalEntries = keys.length

			let estimatedSize = 0
			let oldestEntry = Date.now()
			let newestEntry = 0

			// Sample a subset of entries to estimate size and find age range
			const sampleSize = Math.min(20, totalEntries)
			const sampleKeys = keys.slice(0, sampleSize)

			for (const key of sampleKeys) {
				try {
					const item = await this.store.getItem(key)
					if (item) {
						estimatedSize += this.estimateItemSize(item)

						// Track age if it's a cached directory entry
						if (typeof key === 'string' && key.startsWith('v1:tree:dir:')) {
							const cached = item as CachedDirectoryEntry
							if (cached.cachedAt) {
								oldestEntry = Math.min(oldestEntry, cached.cachedAt)
								newestEntry = Math.max(newestEntry, cached.cachedAt)
							}
						}
					}
				} catch (error) {
					// Skip problematic entries
					continue
				}
			}

			// Extrapolate size estimate to all entries
			const totalEstimatedSize =
				sampleSize > 0 ? (estimatedSize / sampleSize) * totalEntries : 0

			return {
				totalEntries,
				estimatedSizeBytes: totalEstimatedSize,
				oldestEntry: oldestEntry === Date.now() ? 0 : oldestEntry,
				newestEntry,
			}
		} catch (_error) {
			return {
				totalEntries: 0,
				estimatedSizeBytes: 0,
				oldestEntry: 0,
				newestEntry: 0,
			}
		}
	}

	/**
	 * Validate cache integrity and repair corrupted entries
	 */
	async validateCacheIntegrity(
		onProgress?: (progress: {
			completed: number
			total: number
			currentOperation: string
			issues?: string[]
		}) => void
	): Promise<{
		validEntries: number
		corruptedEntries: number
		repairedEntries: number
		issues: string[]
	}> {
		try {
			const keys = await this.store.keys()
			const directoryKeys = keys.filter(
				(key) => typeof key === 'string' && key.startsWith('v1:tree:dir:')
			)

			let validEntries = 0
			let corruptedEntries = 0
			let repairedEntries = 0
			const issues: string[] = []

			onProgress?.({
				completed: 0,
				total: directoryKeys.length,
				currentOperation: 'Validating cache entries...',
			})

			for (let i = 0; i < directoryKeys.length; i++) {
				const key = directoryKeys[i]
				if (typeof key !== 'string') continue

				const path = key.substring('v1:tree:dir:'.length)

				try {
					const cached = await this.store.getItem<CachedDirectoryEntry>(key)

					if (!cached) {
						issues.push(`Missing data for key: ${key}`)
						corruptedEntries++
						continue
					}

					// Validate required fields
					if (!cached.path || !cached.name || !Array.isArray(cached.children)) {
						issues.push(`Invalid structure for path: ${path}`)
						await this.handleCorruptedData(path)
						corruptedEntries++
						repairedEntries++
						continue
					}

					// Validate children structure
					for (const child of cached.children) {
						if (!child || !child.kind || !child.name || !child.path) {
							issues.push(`Invalid child structure in path: ${path}`)
							await this.handleCorruptedData(path)
							corruptedEntries++
							repairedEntries++
							break
						}
					}

					validEntries++
				} catch (error) {
					issues.push(`Error validating path ${path}: ${error}`)
					await this.handleCorruptedData(path)
					corruptedEntries++
					repairedEntries++
				}

				onProgress?.({
					completed: i + 1,
					total: directoryKeys.length,
					currentOperation: `Validated ${i + 1}/${directoryKeys.length} entries`,
					issues: issues.slice(-5), // Show last 5 issues
				})
			}

			return {
				validEntries,
				corruptedEntries,
				repairedEntries,
				issues,
			}
		} catch (error) {
			throw error
		}
	}

	/**
	 * Compact cache by removing duplicate or redundant entries
	 */
	async compactCache(
		onProgress?: (progress: {
			completed: number
			total: number
			currentOperation: string
		}) => void
	): Promise<{ removedEntries: number; spaceSaved: number }> {
		try {
			const keys = await this.store.keys()
			const directoryKeys = keys.filter(
				(key) => typeof key === 'string' && key.startsWith('v1:tree:dir:')
			)

			onProgress?.({
				completed: 0,
				total: directoryKeys.length,
				currentOperation: 'Analyzing cache entries...',
			})

			const pathsToRemove: string[] = []
			let estimatedSpaceSaved = 0

			// Find entries that can be compacted
			for (let i = 0; i < directoryKeys.length; i++) {
				const key = directoryKeys[i]
				if (typeof key !== 'string') continue

				const path = key.substring('v1:tree:dir:'.length)

				try {
					const cached = await this.store.getItem<CachedDirectoryEntry>(key)

					if (cached) {
						// Remove entries with no children (empty directories that might be stale)
						if (
							cached.children.length === 0 &&
							cached.cachedAt < Date.now() - 24 * 60 * 60 * 1000
						) {
							pathsToRemove.push(path)
							estimatedSpaceSaved += this.estimateItemSize(cached)
						}
					}
				} catch (error) {
					// Remove corrupted entries
					pathsToRemove.push(path)
				}

				onProgress?.({
					completed: i + 1,
					total: directoryKeys.length,
					currentOperation: `Analyzed ${i + 1}/${directoryKeys.length} entries`,
				})
			}

			// Remove identified entries
			if (pathsToRemove.length > 0) {
				onProgress?.({
					completed: 0,
					total: pathsToRemove.length,
					currentOperation: 'Compacting cache...',
				})

				for (let i = 0; i < pathsToRemove.length; i++) {
					await this.invalidateDirectory(pathsToRemove[i]!)
					onProgress?.({
						completed: i + 1,
						total: pathsToRemove.length,
						currentOperation: `Compacted ${i + 1}/${pathsToRemove.length} entries`,
					})
				}
			}

			return {
				removedEntries: pathsToRemove.length,
				spaceSaved: estimatedSpaceSaved,
			}
		} catch (error) {
			throw error
		}
	}

	async batchSetDirectories(
		entries: Map<string, FsDirTreeNode>,
		directoryMtimes?: Map<string, number>
	): Promise<void> {
		const startTime = performance.now()

		try {
			const promises: Promise<void>[] = []

			for (const [path, node] of entries) {
				const key = CACHE_KEY_SCHEMA.dir(path)
				const directoryMtime = directoryMtimes?.get(path)
				const cached = this.convertTreeNodeToCached(node, directoryMtime)
				promises.push(this.store.setItem(key, cached).then(() => {}))
			}

			await Promise.all(promises)

			const batchTime = performance.now() - startTime
			this.stats.batchWrites++
			this.stats.batchWriteTime += batchTime
		} catch (error) {
			throw error
		}
	}

	async getCacheStats(): Promise<TreeCacheStats> {
		try {
			const keys = await this.store.keys()
			const totalEntries = keys.length

			const sampleSize = Math.min(10, totalEntries)
			let estimatedSize = 0

			if (sampleSize > 0) {
				const sampleKeys = keys.slice(0, sampleSize)
				let sampleTotalSize = 0

				for (const key of sampleKeys) {
					const item = await this.store.getItem(key)
					if (item) {
						sampleTotalSize += this.estimateItemSize(item)
					}
				}

				estimatedSize = (sampleTotalSize / sampleSize) * totalEntries
			}

			const totalRequests = this.stats.hits + this.stats.misses
			const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0
			const missRate = totalRequests > 0 ? this.stats.misses / totalRequests : 0
			const averageLoadTime =
				this.stats.hits > 0 ? this.stats.totalLoadTime / this.stats.hits : 0
			const averageBatchWriteTime =
				this.stats.batchWrites > 0
					? this.stats.batchWriteTime / this.stats.batchWrites
					: 0

			return {
				totalEntries,
				totalSizeBytes: estimatedSize,
				hitRate,
				missRate,
				averageLoadTime,
				cacheValidationTime: this.stats.validationTime,
				indexedDBSize: estimatedSize,
				oldestEntry: 0,
				newestEntry: Date.now(),
				batchWrites: this.stats.batchWrites,
				averageBatchWriteTime,
			}
		} catch (_error) {
			return {
				totalEntries: 0,
				totalSizeBytes: 0,
				hitRate: 0,
				missRate: 0,
				averageLoadTime: 0,
				cacheValidationTime: 0,
				indexedDBSize: 0,
				oldestEntry: 0,
				newestEntry: 0,
				batchWrites: 0,
				averageBatchWriteTime: 0,
			}
		}
	}

	private convertTreeNodeToCached(
		node: FsDirTreeNode,
		directoryMtime?: number
	): CachedDirectoryEntry {
		const children: CachedChildEntry[] = node.children.map((child) => ({
			kind: child.kind,
			name: child.name,
			path: child.path,
			depth: child.depth,
			parentPath: child.parentPath,
			size: child.kind === 'file' ? child.size : undefined,
			lastModified: child.kind === 'file' ? child.lastModified : undefined,
			isLoaded: child.kind === 'dir' ? child.isLoaded : undefined,
		}))

		return {
			path: node.path,
			name: node.name,
			depth: node.depth,
			parentPath: node.parentPath,
			cachedAt: Date.now(),
			lastModified: directoryMtime, // Use provided directory modification time
			version: this.version,
			children,
			isLoaded: node.isLoaded ?? false,
		}
	}

	private convertCachedToTreeNode(cached: CachedDirectoryEntry): FsDirTreeNode {
		try {
			// Validate cached data structure
			if (!cached || typeof cached !== 'object') {
				throw new Error('Invalid cached data structure')
			}

			if (!cached.path || !cached.name || !Array.isArray(cached.children)) {
				throw new Error('Missing required fields in cached data')
			}

			const children = cached.children.map((child) => {
				if (
					!child ||
					typeof child !== 'object' ||
					!child.kind ||
					!child.name ||
					!child.path
				) {
					throw new Error('Invalid child data structure')
				}

				if (child.kind === 'file') {
					return {
						kind: 'file' as const,
						name: child.name,
						path: child.path,
						depth: child.depth,
						parentPath: child.parentPath,
						size: child.size,
						lastModified: child.lastModified,
					}
				} else {
					return {
						kind: 'dir' as const,
						name: child.name,
						path: child.path,
						depth: child.depth,
						parentPath: child.parentPath,
						children: [],
						isLoaded: child.isLoaded ?? false,
					}
				}
			})

			return {
				kind: 'dir',
				name: cached.name,
				path: cached.path,
				depth: cached.depth,
				parentPath: cached.parentPath,
				children,
				isLoaded: cached.isLoaded,
			}
		} catch (_error) {
			if (cached?.path) {
				this.handleCorruptedData(cached.path).catch(() => {
					// Ignore cleanup errors
				})
			}

			// Return a minimal valid structure to prevent crashes
			return {
				kind: 'dir',
				name: cached?.name || 'corrupted',
				path: cached?.path || '/corrupted',
				depth: cached?.depth || 0,
				parentPath: cached?.parentPath,
				children: [],
				isLoaded: false,
			}
		}
	}

	private estimateItemSize(item: unknown): number {
		if (item === null || item === undefined) {
			return 0
		}

		try {
			return JSON.stringify(item).length * 2
		} catch {
			return 100
		}
	}
}
