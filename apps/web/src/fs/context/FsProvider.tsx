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
import { findNode } from '../runtime/tree'
import { useFileSystemObserver } from '../hooks/useFileSystemObserver'
import { getRootHandle } from '../runtime/fsRuntime'

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
	} = createFsState()

	const fileCache = createFileCacheController({
		state,
		setPieceTable,
		setFileStats,
		setHighlights,
		setFolds,
		setBrackets,
		setErrors,
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
			setError,
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
	} = useFileSelection({
		state,
		setSelectedPath,
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
		setError,
		fileCache,
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
		clearDeferredMetadata,
	})

	const { createDir, createFile, deleteNode, saveFile } = createFsMutations({
		refresh,
		setExpanded,
		setSelectedPath,
		setSelectedFileSize,
		setSelectedFileContent,
		updateSelectedFilePieceTable,
		setError,
		setLoading,
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
			// Reload the file by re-selecting it with forceReload
			await selectPath(path, { forceReload: true })
		},
		reloadDirectory,
		hasLocalEdits: (path: string) => {
			// TODO: Implement proper dirty state tracking
			// For now, check if there's a piece table with edits
			// A file has local edits if its add buffer has content
			const pieceTable = state.pieceTables[path]
			if (!pieceTable) return false

			// If the add buffer has content, it means there are local edits
			return pieceTable.buffers.add.length > 0
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
			ensureDirPathLoaded,
			updateSelectedFilePieceTable,
			updateSelectedFileHighlights,
			updateSelectedFileFolds,
			updateSelectedFileBrackets,
			updateSelectedFileErrors,
			fileCache,
			saveFile,
			setDirtyPath,
		},
	]

	return (
		<FsContext.Provider value={value}>
			{props.children}
			<LocalDirectoryFallbackDialog />
		</FsContext.Provider>
	)
}
