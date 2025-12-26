import {
	createFs,
	walkDirectory,
	type FsContext,
	type FsDirTreeNode,
} from '@repo/fs'
import { expose } from 'comlink'
import { normalizeDirNodeMetadata } from '../utils/treeNodes'
import type {
	PrefetchTarget,
	TreePrefetchWorkerApi,
} from './treePrefetchWorkerTypes'

let ctx: FsContext | undefined
let initialized = false
let fallbackRootName = 'root'

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
	const result = await walkDirectory(
		context,
		{ path: target.path, name: target.name || deriveDirName(target.path) },
		{ includeDirs: true, includeFiles: true, withMeta: false }
	)

	if (!result) return undefined

	return normalizeDirNodeMetadata(
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
}

const api: TreePrefetchWorkerApi = {
	async init(payload) {
		ctx = createFs(payload.rootHandle)
		fallbackRootName = payload.rootName || 'root'
		initialized = true
	},
	async loadDirectory(target) {
		if (!initialized) return undefined
		return loadDirectoryTarget(target)
	},
	async dispose() {
		ctx = undefined
		initialized = false
	},
}

expose(api)
