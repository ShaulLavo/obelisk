import type { FsDirTreeNode } from '@repo/fs'
import { createEffect, type JSX, onCleanup, onMount } from 'solid-js'
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
import { LocalDirectoryFallbackDialog } from '../components/LocalDirectoryFallbackDialog'

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
		setError,
		setLoading,
		setFileStats,
		clearParseResults,
		setPieceTable,
		clearPieceTables,
		setHighlights,
		setFolds,
		setBrackets,
		setErrors,
		setBackgroundPrefetching,
		setBackgroundIndexedFileCount,
		setLastPrefetchedPath,
		setPrefetchError,
		setPrefetchProcessedCount,
		setPrefetchLastDurationMs,
		setPrefetchAverageDurationMs,
		registerDeferredMetadata,
		clearDeferredMetadata
	} = createFsState()

	const fileCache = createFileCacheController({
		state,
		setPieceTable,
		setFileStats,
		setHighlights,
		setFolds,
		setBrackets,
		setErrors
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
			registerDeferredMetadata
		})

	const { buildEnsurePaths, ensureDirLoaded, toggleDir } = useDirectoryLoader({
		state,
		setExpanded,
		setSelectedPath,
		setError,
		setDirNode,
		runPrefetchTask,
		treePrefetchClient
	})

	const { selectPath, updateSelectedFilePieceTable, updateSelectedFileHighlights, updateSelectedFileFolds, updateSelectedFileBrackets, updateSelectedFileErrors } =
		useFileSelection({
			state,
			setSelectedPath,
			setSelectedFileSize,
			setSelectedFilePreviewBytes,
			setSelectedFileContent,
			setSelectedFileLoading,
			setError,
			fileCache
	})

	const { refresh } = useFsRefresh({
		state,
		setTree,
		setExpanded,
		setActiveSource,
		setError,
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
		clearDeferredMetadata
	})

	const { createDir, createFile, deleteNode } = createFsMutations({
		refresh,
		setExpanded,
		setSelectedPath,
		setSelectedFileSize,
		setError,
		getState: () => state,
		getActiveSource: () => state.activeSource
	})

	const setSource = (source: FsSource) => refresh(source)

	onMount(() => {
		restoreHandleCache({
			tree: state.tree,
			activeSource: state.activeSource
		})
		void refresh(state.activeSource ?? DEFAULT_SOURCE)
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
		void disposeTreePrefetchClient()
		clearDeferredMetadata()
	})

	const value: FsContextValue = [
		state,
		{
			refresh,
			setSource,
			toggleDir,
			selectPath,
			createDir,
			createFile,
			deleteNode,
			updateSelectedFilePieceTable,
			updateSelectedFileHighlights,
			updateSelectedFileFolds,
			updateSelectedFileBrackets,
			updateSelectedFileErrors
		}
	]

	return (
		<FsContext.Provider value={value}>
			{props.children}
			<LocalDirectoryFallbackDialog />
		</FsContext.Provider>
	)
}
