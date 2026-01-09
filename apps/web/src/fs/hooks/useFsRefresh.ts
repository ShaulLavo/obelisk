import { batch } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import type { SetStoreFunction } from 'solid-js/store'
import {
	ensureFs,
	buildTree,
	LocalDirectoryFallbackSwitchError,
} from '../runtime/fsRuntime'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsState, FsSource } from '../types'
import type { TreePrefetchClient } from '../prefetch/treePrefetchClient'
import { findNode } from '../runtime/tree'
import { modal } from '@repo/ui/modal'
import { loggers } from '@repo/logger'

type UseFsRefreshOptions = {
	state: FsState
	setTree: SetStoreFunction<FsDirTreeNode>
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setActiveSource: (source: FsSource) => void
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
	runPrefetchTask: (
		task: Promise<void> | undefined,
		fallbackMessage: string
	) => void
	selectPath: (
		path: string,
		options?: { forceReload?: boolean }
	) => Promise<void>
}

export const useFsRefresh = ({
	state,
	setTree,
	setExpanded,
	setActiveSource,
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
	selectPath,
}: UseFsRefreshOptions) => {
	let loadErrorModalId: string | null = null

	const clearLoadError = () => {
		if (!loadErrorModalId) return
		modal.dismiss(loadErrorModalId)
		loadErrorModalId = null
	}

	const showLoadError = (message: string, source: FsSource) => {
		const actions = [
			{
				id: 'retry',
				label: 'Retry',
				variant: 'default' as const,
				autoClose: false,
				onPress: () => {
					void refresh(source)
				},
			},
		]
		if (loadErrorModalId) {
			modal.update(loadErrorModalId, { body: message, actions })
			return
		}
		loadErrorModalId = modal({
			heading: 'Filesystem error',
			body: message,
			dismissable: false,
			actions,
		})
	}

	const getRestorableFilePath = () => {
		// lastKnownFilePath is only set when a file is selected (see FsProvider createEffect)
		// so we can trust it's a file path even if it's not in the tree yet
		const lastFilePath = localStorage.getItem('fs-last-known-file-path') ?? undefined
		
		console.log(`[useFsRefresh] getRestorableFilePath called`, { 
			selectedPath: state.selectedPath, 
			lastKnownFilePath: state.lastKnownFilePath,
			lastFilePath,
		})

		// If we have a stored file path from localStorage, use it directly
		// The file might not be in the tree yet (parent dir not loaded), but selectPath can handle that
		if (lastFilePath) {
			console.log(`[useFsRefresh] getRestorableFilePath: using lastFilePath from localStorage`, { lastFilePath })
			return lastFilePath
		}

		console.log(`[useFsRefresh] getRestorableFilePath: no restorable path found`)
		return undefined
	}

	const refresh = async (
		initialSource: FsSource = state.activeSource ?? DEFAULT_SOURCE
	) => {
		let source = initialSource
		for (;;) {
			batch(() => {
				setLoading(true)
				clearParseResults()
				clearPieceTables()
				clearFileCache()
				clearDeferredMetadata()
			})
			const ensurePaths = buildEnsurePaths()

			try {
				const fsCtx = await ensureFs(source)
				const built = await buildTree(source, {
					expandedPaths: state.expanded,
					ensurePaths,
				})
				const restorablePath = getRestorableFilePath()

				batch(() => {
					setTree(built)
					setActiveSource(source)
					setExpanded((expanded) => ({
						...expanded,
						[built.path]: expanded[built.path] ?? true,
					}))
				})
				clearLoadError()

				await treePrefetchClient.init({
					source,
					rootHandle: fsCtx.root,
					rootPath: built.path ?? '',
					rootName: built.name || 'root',
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

				console.log(`[useFsRefresh] refresh: about to restore file`, { restorablePath })
				if (restorablePath) {
					console.log(`[useFsRefresh] refresh: calling selectPath with forceReload`, { restorablePath })
					await selectPath(restorablePath, { forceReload: true })
					console.log(`[useFsRefresh] refresh: selectPath complete`, { restorablePath })
				} else {
					console.log(`[useFsRefresh] refresh: no restorablePath, skipping selectPath`)
				}
				return
			} catch (error) {
				if (error instanceof LocalDirectoryFallbackSwitchError) {
					source = error.nextSource
					continue
				}
				loggers.fs.error('[fs] Failed to refresh filesystem', error)
				batch(() => {
					setBackgroundPrefetching(false)
					setBackgroundIndexedFileCount(0)
					setLastPrefetchedPath(undefined)
				})
				showLoadError(
					error instanceof Error ? error.message : 'Failed to load filesystem',
					source
				)
				return
			} finally {
				setLoading(false)
			}
		}
	}

	return {
		refresh,
	}
}
