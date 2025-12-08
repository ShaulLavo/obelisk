import { batch } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import type { SetStoreFunction } from 'solid-js/store'
import { ensureFs, buildTree } from '../runtime/fsRuntime'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsState, FsSource } from '../types'
import type { TreePrefetchClient } from '../prefetch/treePrefetchClient'
import { findNode } from '../runtime/tree'

type UseFsRefreshOptions = {
	state: FsState
	setTree: SetStoreFunction<FsDirTreeNode>
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setActiveSource: (source: FsSource) => void
	setError: (message: string | undefined) => void
	setLoading: (value: boolean) => void
	clearParseResults: () => void
	clearPieceTables: () => void
	clearFileCache: () => void
	clearDeferredMetadata: () => void
	setBackgroundPrefetching: (value: boolean) => void
	setBackgroundIndexedFileCount: (value: number) => void
	setLastPrefetchedPath: (path: string | undefined) => void
	ensureDirLoaded: (path: string) => Promise<void> | undefined
	buildEnsurePaths: () => string[]
	treePrefetchClient: TreePrefetchClient
	runPrefetchTask: (task: Promise<void> | undefined, fallbackMessage: string) => void
	selectPath: (path: string, options?: { forceReload?: boolean }) => Promise<void>
}

export const useFsRefresh = ({
	state,
	setTree,
	setExpanded,
	setActiveSource,
	setError,
	setLoading,
	clearParseResults,
	clearPieceTables,
	clearFileCache,
	clearDeferredMetadata,
	setBackgroundPrefetching,
	setBackgroundIndexedFileCount,
	setLastPrefetchedPath,
	ensureDirLoaded,
	buildEnsurePaths,
	treePrefetchClient,
	runPrefetchTask,
	selectPath
}: UseFsRefreshOptions) => {
	const getRestorableFilePath = (tree: FsDirTreeNode) => {
		const candidates = [state.selectedPath, state.lastKnownFilePath].filter(
			(path): path is string => typeof path === 'string'
		)

		for (const candidate of candidates) {
			const node = findNode(tree, candidate)
			if (node?.kind === 'file') {
				return node.path
			}
		}

		return undefined
	}

	const refresh = async (
		source: FsSource = state.activeSource ?? DEFAULT_SOURCE
	) => {
		setLoading(true)
		clearParseResults()
		clearPieceTables()
		clearFileCache()
		clearDeferredMetadata()
		const ensurePaths = buildEnsurePaths()

		try {
			const fsCtx = await ensureFs(source)
			const built = await buildTree(source, {
				expandedPaths: state.expanded,
				ensurePaths
			})
			const restorablePath = getRestorableFilePath(built)

			batch(() => {
				setTree(built)
				setActiveSource(source)
				setExpanded(expanded => ({
					...expanded,
					[built.path]: expanded[built.path] ?? true
				}))
				setError(undefined)
			})

			await treePrefetchClient.init({
				source,
				rootHandle: fsCtx.root,
				rootPath: built.path ?? '',
				rootName: built.name || 'root'
			})
			runPrefetchTask(
				treePrefetchClient.seedTree(built),
				'Failed to seed prefetch worker'
			)

			for (const [expandedPath, isOpen] of Object.entries(state.expanded)) {
				if (isOpen) {
					void ensureDirLoaded(expandedPath)
				}
			}

			if (restorablePath) {
				await selectPath(restorablePath, { forceReload: true })
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Failed to load filesystem'
			)
			setBackgroundPrefetching(false)
			setBackgroundIndexedFileCount(0)
			setLastPrefetchedPath(undefined)
		} finally {
			setLoading(false)
		}
	}

	return {
		refresh
	}
}
