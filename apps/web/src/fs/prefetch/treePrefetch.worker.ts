import {
	createFs,
	walkDirectory,
	type FsContext,
	type FsDirTreeNode,
} from '@repo/fs'
import { expose } from 'comlink'
import { normalizeDirNodeMetadata } from '../utils/treeNodes'
import { createWorkerTreeCache, type WorkerTreeCache } from '../cache/workerTreeCache'
import type {
	PrefetchTarget,
	TreePrefetchWorkerApi,
} from './treePrefetchWorkerTypes'

let ctx: FsContext | undefined
let initialized = false
let fallbackRootName = 'root'
let workerCache: WorkerTreeCache | undefined

const ensureContext = () => {
	if (!ctx || !initialized) {
		throw new Error('TreePrefetch worker is not initialized')
	}

	return ctx
}

const deriveDirName = (path: string) => {
	if (!path) return fallbackRootName
	const segments = path.split('/').filter(Boolean)
	return segments[segments.length - 1] ?? fallbackRootName
}

const loadDirectoryTarget = async (
	target: PrefetchTarget
): Promise<FsDirTreeNode | undefined> => {
	const context = ensureContext()
	
	// Check cache first if available
	if (workerCache) {
		try {
			const cached = await workerCache.getDirectory(target.path)
			if (cached) {
				// TODO: Add freshness validation here when modification time checking is implemented
				// For now, we'll always scan to ensure data is fresh
			}
		} catch (error) {
			console.warn(`Worker cache check failed for ${target.path}:`, error)
		}
	}
	
	// Perform filesystem scan
	const result = await walkDirectory(
		context,
		{ path: target.path, name: target.name || deriveDirName(target.path) },
		{ includeDirs: true, includeFiles: true, withMeta: false }
	)

	if (!result) return undefined

	const treeNode = normalizeDirNodeMetadata(
		{
			kind: 'dir',
			name: result.name,
			path: result.path,
			parentPath: target.parentPath,
			depth: target.depth,
			children: [...result.dirs, ...result.files],
			isLoaded: true,
		},
		target.parentPath,
		target.depth
	)
	
	// Populate cache with scan results
	if (workerCache && treeNode) {
		try {
			const cachedEntry = {
				path: treeNode.path,
				name: treeNode.name,
				depth: treeNode.depth,
				parentPath: treeNode.parentPath,
				cachedAt: Date.now(),
				lastModified: Date.now(), // TODO: Use actual directory modification time
				version: 1,
				children: treeNode.children.map(child => ({
					kind: child.kind,
					name: child.name,
					path: child.path,
					depth: child.depth,
					parentPath: child.parentPath,
					size: child.kind === 'file' ? child.size : undefined,
					lastModified: child.kind === 'file' ? child.lastModified : undefined,
					isLoaded: child.kind === 'dir' ? (child.isLoaded ?? false) : undefined,
				})),
				isLoaded: treeNode.isLoaded ?? false,
			}
			
			await workerCache.setDirectory(target.path, cachedEntry)
		} catch (error) {
			console.warn(`Worker failed to cache scan results for ${target.path}:`, error)
		}
	}

	return treeNode
}

const api: TreePrefetchWorkerApi = {
	async init(payload) {
		ctx = createFs(payload.rootHandle)
		fallbackRootName = payload.rootName || 'root'
		
		// Initialize worker cache with shared database schema
		try {
			workerCache = createWorkerTreeCache({
				dbName: 'tree-cache', // Same as main thread
				storeName: 'directories' // Same as main thread
			})
		} catch (error) {
			console.warn('Worker cache initialization failed:', error)
			workerCache = undefined
		}
		
		initialized = true
	},
	async loadDirectory(target) {
		if (!initialized) return undefined
		return loadDirectoryTarget(target)
	},
	async dispose() {
		ctx = undefined
		workerCache = undefined
		initialized = false
	},
}

expose(api)
