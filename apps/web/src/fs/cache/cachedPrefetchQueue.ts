import type { FsDirTreeNode } from '@repo/fs'
import { logger } from '~/logger'
import { PrefetchQueue } from '../prefetch/prefetchQueue'
import type {
	PrefetchTarget,
	TreePrefetchWorkerCallbacks,
} from '../prefetch/treePrefetchWorkerTypes'
import { TreeCacheController } from './treeCacheController'

const cacheLogger = logger.withTag('cached-prefetch')

export interface CachedPrefetchQueueOptions {
	workerCount: number
	loadDirectory: (target: PrefetchTarget) => Promise<FsDirTreeNode | undefined>
	callbacks: TreePrefetchWorkerCallbacks
	cacheController?: TreeCacheController
}

export class CachedPrefetchQueue extends PrefetchQueue {
	private readonly cacheController: TreeCacheController
	private readonly originalLoadDirectory: (
		target: PrefetchTarget
	) => Promise<FsDirTreeNode | undefined>
	private readonly callbacks: TreePrefetchWorkerCallbacks

	constructor(options: CachedPrefetchQueueOptions) {
		const originalLoader = options.loadDirectory

		super({
			workerCount: options.workerCount,
			loadDirectory: (target) => this.loadDirectoryWithCache(target),
			callbacks: options.callbacks,
		})

		this.originalLoadDirectory = originalLoader
		this.callbacks = options.callbacks
		this.cacheController = options.cacheController ?? new TreeCacheController()
		cacheLogger.debug('CachedPrefetchQueue initialized')
	}

	async seedTree(tree?: FsDirTreeNode) {
		if (!tree) return

		// Cache-first startup: load cached tree immediately for instant display
		const cachedTree = await this.cacheController.getCachedTree(tree.path)
		if (cachedTree) {
			cacheLogger.debug(
				'Cache-first startup: displaying cached tree immediately',
				{
					path: tree.path,
					childrenCount: cachedTree.children.length,
				}
			)

			// Display cached tree immediately
			super.seedTree(cachedTree)

			// Start background validation of all cached directories
			this.validateTreeInBackground(tree).catch((error) => {
				cacheLogger.warn('Background tree validation failed', {
					path: tree.path,
					error,
				})
			})
		} else {
			cacheLogger.debug(
				'No cached tree available, proceeding with normal loading',
				{ path: tree.path }
			)
			super.seedTree(tree)
		}

		// Always cache the provided tree data
		await this.cacheController.setCachedTree(tree.path, tree)
	}

	private async validateTreeInBackground(tree: FsDirTreeNode): Promise<void> {
		try {
			cacheLogger.debug('Starting background tree validation', {
				path: tree.path,
			})

			// Validate all directories in the tree structure
			const validationPromises: Promise<void>[] = []

			const validateDirectory = async (node: FsDirTreeNode) => {
				// Skip if not a directory or not loaded
				if (node.kind !== 'dir' || !node.isLoaded) {
					return
				}

				const target: PrefetchTarget = {
					path: node.path,
					name: node.name,
					depth: node.depth,
					parentPath: node.parentPath,
				}

				// Get cached data for comparison
				const cachedNode = await this.cacheController.getCachedDirectory(
					node.path
				)
				if (cachedNode) {
					await this.validateInBackground(target, cachedNode)
				}

				// Recursively validate child directories
				for (const child of node.children) {
					if (child.kind === 'dir' && child.isLoaded) {
						validationPromises.push(validateDirectory(child))
					}
				}
			}

			await validateDirectory(tree)
			await Promise.all(validationPromises)

			cacheLogger.debug('Background tree validation completed', {
				path: tree.path,
			})
		} catch (error) {
			cacheLogger.warn('Background tree validation error', {
				path: tree.path,
				error,
			})
		}
	}

	private async loadDirectoryWithCache(
		target: PrefetchTarget
	): Promise<FsDirTreeNode | undefined> {
		const startTime = performance.now()

		try {
			// First, try to get cached data for immediate display
			const cachedNode = await this.cacheController.getCachedDirectory(
				target.path
			)

			if (cachedNode) {
				cacheLogger.debug('Displaying cached data immediately', {
					path: target.path,
					childrenCount: cachedNode.children.length,
				})

				// Trigger background validation (don't await) - use setTimeout to ensure it runs asynchronously
				setTimeout(() => {
					this.validateInBackground(target, cachedNode).catch((error) => {
						cacheLogger.warn('Background validation failed', {
							path: target.path,
							error,
						})
					})
				}, 0)

				// Return the cached data immediately (already converted by getCachedDirectory)
				return cachedNode
			}

			// No cached data available, perform fresh load
			const freshNode = await this.originalLoadDirectory(target)

			if (!freshNode) {
				return undefined
			}

			// Use incremental update to cache the fresh data with proper relationship handling
			await this.cacheController.performIncrementalUpdate(
				target.path,
				freshNode
			)

			const loadTime = performance.now() - startTime
			cacheLogger.debug('Loaded and cached directory (no cache available)', {
				path: target.path,
				childrenCount: freshNode.children.length,
				loadTime,
			})

			return freshNode
		} catch (error) {
			cacheLogger.warn('Failed to load directory with cache', {
				path: target.path,
				error,
			})
			throw error
		}
	}

	private async validateInBackground(
		target: PrefetchTarget,
		cachedNode: FsDirTreeNode
	): Promise<void> {
		try {
			cacheLogger.debug('Starting background validation', { path: target.path })

			// Perform fresh filesystem scan in background
			const freshNode = await this.originalLoadDirectory(target)

			if (!freshNode) {
				cacheLogger.debug('Background validation: no fresh data found', {
					path: target.path,
				})
				return
			}

			// Check if data has changed
			const hasChanged = this.hasDataChanged(cachedNode, freshNode)

			if (hasChanged) {
				cacheLogger.debug(
					'Background validation: changes detected, updating cache and UI',
					{
						path: target.path,
						cachedChildren: cachedNode.children?.length || 0,
						freshChildren: freshNode.children.length,
					}
				)

				// Update cache with fresh data using incremental update
				await this.cacheController.mergeDirectoryUpdate(target.path, freshNode)

				// Notify UI of changes through callbacks
				this.callbacks.onDirectoryLoaded({
					node: freshNode,
				})
			} else {
				cacheLogger.debug('Background validation: no changes detected', {
					path: target.path,
				})
			}
		} catch (error) {
			cacheLogger.warn('Background validation error', {
				path: target.path,
				error,
			})
		}
	}

	private hasDataChanged(
		cachedNode: FsDirTreeNode,
		freshNode: FsDirTreeNode
	): boolean {
		// Simple change detection based on children count and names
		const cachedChildren = cachedNode.children || []
		const freshChildren = freshNode.children || []

		if (cachedChildren.length !== freshChildren.length) {
			return true
		}

		// Check if child names have changed
		const cachedNames = new Set(cachedChildren.map((child) => child.name))
		const freshNames = new Set(freshChildren.map((child) => child.name))

		for (const name of freshNames) {
			if (!cachedNames.has(name)) {
				return true
			}
		}

		for (const name of cachedNames) {
			if (!freshNames.has(name)) {
				return true
			}
		}

		return false
	}

	/**
	 * Perform selective incremental update for changed directories only
	 * Preserves cached data for unchanged directories
	 */
	async performIncrementalUpdate(
		changedPaths: string[],
		directoryMtimes?: Map<string, number>
	): Promise<void> {
		try {
			cacheLogger.debug('Starting incremental update', {
				changedPathsCount: changedPaths.length,
				paths: changedPaths,
			})

			const updatePromises = changedPaths.map(async (path) => {
				// Create target for the changed directory
				const pathSegments = path.split('/').filter(Boolean)
				const name = pathSegments[pathSegments.length - 1] || 'root'
				const depth = pathSegments.length
				const parentPath =
					depth > 0 ? '/' + pathSegments.slice(0, -1).join('/') : undefined

				const target: PrefetchTarget = {
					path,
					name,
					depth,
					parentPath: parentPath === '/' ? undefined : parentPath,
				}

				// Load fresh data for this directory only
				const freshNode = await this.originalLoadDirectory(target)
				if (freshNode) {
					const directoryMtime = directoryMtimes?.get(path)
					await this.cacheController.performIncrementalUpdate(
						path,
						freshNode,
						directoryMtime
					)

					// Notify UI of the update
					this.callbacks.onDirectoryLoaded({
						node: freshNode,
					})
				}
			})

			await Promise.all(updatePromises)

			cacheLogger.debug('Completed incremental update', {
				updatedCount: changedPaths.length,
			})
		} catch (error) {
			cacheLogger.warn('Incremental update failed', { error })
			throw error
		}
	}

	/**
	 * Detect which directories need incremental updates based on modification times
	 */
	async detectDirectoriesNeedingUpdate(
		directoryMtimes: Map<string, number>
	): Promise<string[]> {
		try {
			return await this.cacheController.getDirectoriesNeedingUpdate(
				directoryMtimes
			)
		} catch (error) {
			cacheLogger.warn('Failed to detect directories needing update', { error })
			return []
		}
	}

	/**
	 * Enhanced cache-first loading with incremental update support
	 */
	async loadWithIncrementalUpdate(
		rootPath: string,
		directoryMtimes?: Map<string, number>
	): Promise<void> {
		try {
			// First, load cached tree for immediate display
			const cachedTree = await this.cacheController.getCachedTree(rootPath)
			if (cachedTree) {
				cacheLogger.debug('Displaying cached tree immediately', {
					path: rootPath,
					childrenCount: cachedTree.children.length,
				})

				// Display cached tree immediately
				this.callbacks.onDirectoryLoaded({
					node: cachedTree,
				})
			}

			// Detect which directories need updates
			if (directoryMtimes) {
				const directoriesNeedingUpdate =
					await this.detectDirectoriesNeedingUpdate(directoryMtimes)

				if (directoriesNeedingUpdate.length > 0) {
					cacheLogger.debug(
						'Performing incremental updates for changed directories',
						{
							count: directoriesNeedingUpdate.length,
							paths: directoriesNeedingUpdate,
						}
					)

					// Perform incremental updates only for changed directories
					await this.performIncrementalUpdate(
						directoriesNeedingUpdate,
						directoryMtimes
					)
				} else {
					cacheLogger.debug('No directories need updates, using cached data')
				}
			}
		} catch (error) {
			cacheLogger.warn('Load with incremental update failed', { error })
			throw error
		}
	}

	private async populateCacheFromScan(
		path: string,
		node: FsDirTreeNode
	): Promise<void> {
		try {
			await this.cacheController.setCachedDirectory(path, node)
			cacheLogger.debug('Populated cache from scan', {
				path,
				childrenCount: node.children.length,
			})
		} catch (error) {
			cacheLogger.warn('Failed to populate cache from scan', { path, error })
		}
	}

	async clearCache(): Promise<void> {
		await this.cacheController.clearCache()
		cacheLogger.info('Cleared cache data')
	}

	async getCacheStats() {
		return await this.cacheController.getCacheStats()
	}
}
