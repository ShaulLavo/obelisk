import type { FsDirTreeNode } from '@repo/fs'
import {
	createEffect,
	createSelector,
	type JSX,
	onCleanup,
	onMount,
} from 'solid-js'
import { DEFAULT_SOURCE } from '../config/constants'
import { createFsMutations } from '../fsMutations'
import { restoreHandleCache } from '../runtime/handleCache'
import { createFsState } from '../hooks/createFsState'
import type { FsSource } from '../types'
import { FsContext, type FsContextValue } from './FsContext'
import { replaceDirNodeInTree } from '../utils/treeNodes'
import { makeTreePrefetch } from '../hooks/useTreePrefetch'
import { useDirectoryLoader } from '../hooks/useDirectoryLoader'
import { useFileSelection } from '../hooks/useFileSelection'
import { useFsRefresh } from '../hooks/useFsRefresh'
import { createFileCacheController } from '../cache/fileCacheController'
import { LocalDirectoryFallbackModal } from '../components/LocalDirectoryFallbackModal'
import { findNode } from '../runtime/tree'
import { getRootHandle } from '../runtime/fsRuntime'
import { useFileSystemObserver } from '../hooks/useFileSystemObserver'
export function FsProvider(props: { children: JSX.Element }) {
	const {
		state,
		setTree,
		setExpanded,
		setSelectedPath,
		setActiveSource,
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
		setLoading,
		setSaving,
		setFileStats,
		clearParseResults,
		setPieceTable,
		clearPieceTables,
		setHighlights,
		applyHighlightOffset,
		setFolds,
		setBrackets,
		setErrors,
		setDirtyPath,
		setBackgroundPrefetching,
		setBackgroundIndexedFileCount,
		setLastPrefetchedPath,
		setPrefetchError,
		setPrefetchProcessedCount,
		setPrefetchLastDurationMs,
		setPrefetchAverageDurationMs,
		registerDeferredMetadata,
		clearDeferredMetadata,
		setScrollPosition,
		setVisibleContent,
	} = createFsState()

	const fileCache = createFileCacheController({
		state,
		setPieceTable,
		setFileStats,
		setHighlights,
		setFolds,
		setBrackets,
		setErrors,
		setScrollPosition,
		setVisibleContent,
	})

	const setDirNode = (path: string, node: FsDirTreeNode) => {
		if (!state.tree) return
		if (!path) {
			setTree(() => node)
			return
		}
		const nextTree = replaceDirNodeInTree(state.tree, path, node)
		if (nextTree === state.tree) return
		setTree(() => nextTree)
	}

	const { treePrefetchClient, runPrefetchTask, disposeTreePrefetchClient } =
		makeTreePrefetch({
			state,
			setDirNode,
			setLastPrefetchedPath,
			setBackgroundPrefetching,
			setBackgroundIndexedFileCount,
			setPrefetchError,
			setPrefetchProcessedCount,
			setPrefetchLastDurationMs,
			setPrefetchAverageDurationMs,
			registerDeferredMetadata,
		})

	const { buildEnsurePaths, ensureDirLoaded, toggleDir, reloadDirectory } =
		useDirectoryLoader({
			state,
			setExpanded,
			setSelectedPath,
			setDirNode,
			runPrefetchTask,
			treePrefetchClient,
		})

	const {
		selectPath,
		updateSelectedFilePieceTable,
		updateSelectedFileHighlights,
		updateSelectedFileFolds,
		updateSelectedFileBrackets,
		updateSelectedFileErrors,
		updateSelectedFileScrollPosition,
		updateSelectedFileVisibleContent,
	} = useFileSelection({
		state,
		setSelectedPath,
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
		fileCache,
	})

	// Optimistic highlight offset - queue edits for lazy per-line shifts
	const applySelectedFileHighlightOffset = (
		transform: Parameters<typeof applyHighlightOffset>[1]
	) => {
		const path = state.lastKnownFilePath
		if (!path) return
		applyHighlightOffset(path, transform)
	}

	const { refresh } = useFsRefresh({
		state,
		setTree,
		setExpanded,
		setActiveSource,
		setLoading,
		clearParseResults,
		clearPieceTables,
		clearFileCache: fileCache.clearAll,
		setBackgroundPrefetching,
		setBackgroundIndexedFileCount,
		setLastPrefetchedPath,
		ensureDirLoaded,
		buildEnsurePaths,
		treePrefetchClient,
		runPrefetchTask,
		selectPath,
		clearDeferredMetadata,
	})

	const { createDir, createFile, deleteNode, saveFile } = createFsMutations({
		refresh,
		setExpanded,
		setSelectedPath,
		setSelectedFileSize,
		setSelectedFileContent,
		updateSelectedFilePieceTable,
		setSaving,
		setDirtyPath,
		getState: () => state,
		getActiveSource: () => state.activeSource,
	})

	const ensureDirPathLoaded = async (
		path: string
	): Promise<FsDirTreeNode | undefined> => {
		const tree = state.tree
		if (!tree) return undefined
		if (!path) {
			return tree
		}

		const segments = path.split('/').filter(Boolean)
		let currentPath = ''

		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			const load = ensureDirLoaded(currentPath)
			if (load) {
				await load
				// Re-read state.tree after await to avoid using a stale reference
				const latestTree = state.tree
				if (!latestTree) return undefined
				const currentNode = findNode(latestTree, currentPath)
				if (!currentNode || currentNode.kind !== 'dir') {
					return undefined
				}
			} else {
				// No await happened, safe to use current state.tree
				const currentNode = findNode(state.tree, currentPath)
				if (!currentNode || currentNode.kind !== 'dir') {
					return undefined
				}
			}
		}

		// Final validation with latest tree
		const latestTree = state.tree
		if (!latestTree) return undefined
		const node = findNode(latestTree, path)
		return node && node.kind === 'dir' ? node : undefined
	}

	const setSource = (source: FsSource) => refresh(source)

	// FileSystemObserver integration for live file sync
	const { startObserving, stopObserving } = useFileSystemObserver({
		state,
		reloadFile: async (path: string) => {
			// Only reload the currently selected file
			// Other files will load fresh from disk when selected
			if (path !== state.lastKnownFilePath) {
				return
			}
			await selectPath(path, { forceReload: true })
		},
		reloadDirectory,
		hasLocalEdits: (path: string) => {
			return !!state.dirtyPaths[path]
		},
		getRootHandle: () => getRootHandle(state.activeSource ?? DEFAULT_SOURCE),
		pollIntervalMs: 1000,
	})

	onMount(() => {
		restoreHandleCache({
			tree: state.tree,
			activeSource: state.activeSource,
		})
		void refresh(state.activeSource ?? DEFAULT_SOURCE).then(() => {
			// Start observing after initial refresh completes
			void startObserving()
		})
	})

	createEffect(() => {
		const node = state.selectedNode
		if (node?.kind === 'file') {
			localStorage.setItem('fs-last-known-file-path', node.path)
		}
	})

	onMount(() => {
		const lastFilePath =
			localStorage.getItem('fs-last-known-file-path') ?? undefined
		setSelectedPath(lastFilePath)
	})

	onCleanup(() => {
		stopObserving()
		void disposeTreePrefetchClient()
		clearDeferredMetadata()
	})

	const isSelectedPath = createSelector(() => state.selectedPath)

	const value: FsContextValue = [
		state,
		{
			refresh,
			setSource,
			toggleDir,
			selectPath,
			isSelectedPath,
			createDir,
			createFile,
			deleteNode,
			ensureDirPathLoaded,
			updateSelectedFilePieceTable,
			updateSelectedFileHighlights,
			applySelectedFileHighlightOffset,
			updateSelectedFileFolds,
			updateSelectedFileBrackets,
			updateSelectedFileErrors,
			updateSelectedFileScrollPosition,
			updateSelectedFileVisibleContent,
			fileCache,
			saveFile,
			setDirtyPath,
		},
	]

	return (
		<FsContext.Provider value={value}>
			{props.children}
			<LocalDirectoryFallbackModal />
		</FsContext.Provider>
	)
}
