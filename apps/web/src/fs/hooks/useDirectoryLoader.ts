import { batch } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import { buildTree } from '../runtime/fsRuntime'
import type { FsState } from '../types'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsDirTreeNode, FilePath } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { normalizeDirNodeMetadata } from '../utils/treeNodes'
import type { TreePrefetchClient } from '../prefetch/treePrefetchClient'
import { toast } from '@repo/ui/toaster'

type UseDirectoryLoaderOptions = {
	state: FsState
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: (path: string | undefined) => void
	setDirNode: (path: string, node: FsDirTreeNode) => void
	runPrefetchTask: (
		task: Promise<void> | undefined,
		fallbackMessage: string
	) => void
	treePrefetchClient: TreePrefetchClient
}

type EnsureDirLoadResult = Promise<void> | undefined

export const useDirectoryLoader = ({
	state,
	setExpanded,
	setSelectedPath,
	setDirNode,
	runPrefetchTask,
	treePrefetchClient,
}: UseDirectoryLoaderOptions) => {
	const subtreeLoads = new Map<string, Promise<void>>()

	const getNode = (path: string) => state.pathIndex[createFilePath(path)]

	const buildEnsurePaths = () => {
		const paths = new Set<string>()
		const selectedNode = state.selectedNode
		if (selectedNode?.kind === 'file') {
			paths.add(selectedNode.path)
		}
		// Also add selectedPath if it looks like a file path (for paths not yet in tree)
		const selectedPath = state.selectedPath
		if (selectedPath && selectedPath.includes('.') && !selectedPath.endsWith('/')) {
			paths.add(selectedPath)
		}
		return Array.from(paths)
	}

	const ensureDirLoaded = (path: string): EnsureDirLoadResult => {
		if (!state.tree) return
		const existing = getNode(path)
		if (!existing || existing.kind !== 'dir') return
		if (existing.isLoaded !== false) return
		const inflight = subtreeLoads.get(path)
		if (inflight) return inflight

		const expandedSnapshot = { ...state.expanded }
		const ensurePaths = buildEnsurePaths()
		const load = (async () => {
			try {
				const source = state.activeSource ?? DEFAULT_SOURCE
				const subtree = await buildTree(source, {
					rootPath: path,
					expandedPaths: expandedSnapshot,
					ensurePaths,
					operationName: 'fs:buildSubtree',
				})
				const latest = getNode(path)
				if (!latest || latest.kind !== 'dir') return
				const normalized = normalizeDirNodeMetadata(
					subtree,
					latest.parentPath,
					latest.depth
				)
				setDirNode(path, normalized)
				runPrefetchTask(
					treePrefetchClient.ingestSubtree(normalized),
					'Failed to sync prefetch worker'
				)
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: 'Failed to load directory contents'
				toast.error(message)
			} finally {
				subtreeLoads.delete(path)
			}
		})()

		subtreeLoads.set(path, load)
		return load
	}

	const toggleDir = (path: string) => {
		const next = !state.expanded[path as FilePath]
		batch(() => {
			setExpanded(path, next)
			setSelectedPath(path)
		})
		if (next) {
			void ensureDirLoaded(path)
		}
	}

	const reloadDirectory = async (path: string): Promise<void> => {
		if (!state.tree) return

		const targetPath = path || ''
		const existing = getNode(targetPath)
		if (!existing || existing.kind !== 'dir') return

		subtreeLoads.delete(targetPath)

		const expandedSnapshot = { ...state.expanded }
		const ensurePaths = buildEnsurePaths()

		try {
			const source = state.activeSource ?? DEFAULT_SOURCE
			const subtree = await buildTree(source, {
				rootPath: targetPath,
				expandedPaths: expandedSnapshot,
				ensurePaths,
				operationName: 'fs:reloadDirectory',
			})

			const latest = getNode(targetPath)
			if (!latest || latest.kind !== 'dir') return

			const normalized = normalizeDirNodeMetadata(
				subtree,
				latest.parentPath,
				latest.depth
			)
			setDirNode(targetPath, normalized)
			runPrefetchTask(
				treePrefetchClient.ingestSubtree(normalized),
				'Failed to sync prefetch worker after reload'
			)
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to reload directory contents'
			toast.error(message)
		}
	}

	return {
		buildEnsurePaths,
		ensureDirLoaded,
		toggleDir,
		reloadDirectory,
	}
}
