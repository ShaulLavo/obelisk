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
import type { ViewMode } from '../types/ViewMode'
import { getValidViewMode } from '../utils/viewModeDetection'
import { FsContext, type FsContextValue } from './FsContext'
import { replaceDirNodeInTree } from '../utils/treeNodes'
import { makeTreePrefetch } from '../hooks/useTreePrefetch'
import { createReactiveTree } from '../tree/ReactiveTree'
import { useDirectoryLoader } from '../hooks/useDirectoryLoader'
import { useFileSelection } from '../hooks/useFileSelection'
import { useFsRefresh } from '../hooks/useFsRefresh'
import { createFileCacheControllerV2 } from '../cache/fileCacheController'
import { LocalDirectoryFallbackModal } from '../components/LocalDirectoryFallbackModal'
import { findNode } from '../runtime/tree'
import { getRootHandle, invalidateFs } from '../runtime/fsRuntime'
import { useFileSystemObserver } from '../hooks/useFileSystemObserver'
import { pickNewLocalRoot as doPick } from '@repo/fs'
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
		setCursorPosition,
		setSelections,
		setVisibleContent,
		setViewMode,
		collapseAll,
		setCreationState,
	} = createFsState()

	// Wrapper for setViewMode that includes stats and error handling
	const setViewModeWithStats = (path: string, viewMode: ViewMode) => {
		const stats = state.fileStats[path]
		// Validate the requested view mode and fallback if unavailable
		const validViewMode = getValidViewMode(viewMode, path, stats)
		setViewMode(path, validViewMode, stats)
	}

	// Wrapper for cache controller - handles undefined to clear
	const setViewModeForCache = (path: string, viewMode?: ViewMode) => {
		if (viewMode === undefined) {
			// Clear view mode by setting to default
			const stats = state.fileStats[path]
			setViewMode(path, 'editor', stats)
		} else {
			setViewModeWithStats(path, viewMode)
		}
	}

	const fileCache = createFileCacheControllerV2({
		state,
		setPieceTable,
		setFileStats,
		setHighlights,
		setFolds,
		setBrackets,
		setErrors,
		setScrollPosition,
		setCursorPosition,
		setSelections,
		setVisibleContent,
		setViewMode: setViewModeForCache,
		setDirtyPath,
	})

	// Reactive tree for O(1) prefetch updates
	const reactiveTree = createReactiveTree()

	const setDirNode = (path: string, node: FsDirTreeNode) => {
		if (!state.tree) return
		if (!path) {
			setTree(() => node)
			reactiveTree.setRoot(node)
			return
		}
		const nextTree = replaceDirNodeInTree(state.tree, path, node)
		if (nextTree === state.tree) return
		setTree(() => nextTree)
		// Keep reactive tree in sync for user-initiated directory loads
		reactiveTree.updateDirectory(path, node.children)
	}

	const { treePrefetchClient, runPrefetchTask, disposeTreePrefetchClient } =
		makeTreePrefetch({
			reactiveTree,
			setLastPrefetchedPath,
			setBackgroundPrefetching,
			setBackgroundIndexedFileCount,
			setPrefetchError,
			setPrefetchProcessedCount,
			setPrefetchLastDurationMs,
			setPrefetchAverageDurationMs,
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
		selectPath: selectPathInternal,
		updateSelectedFilePieceTable,
		updateSelectedFileHighlights,
		updateSelectedFileFolds,
		updateSelectedFileBrackets,
		updateSelectedFileErrors,
		updateSelectedFileScrollPosition,
		updateSelectedFileVisibleContent,
		updateSelectedFileCursorPosition,
		updateSelectedFileSelections,
	} = useFileSelection({
		state,
		setSelectedPath,
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
		setDirtyPath,
		fileCache,
	})

	const selectPath = async (
		path: string,
		options?: Parameters<typeof selectPathInternal>[1]
	) => {
		const previousPath = state.lastKnownFilePath
		if (previousPath && previousPath !== path) {
			await fileCache.flush()
			fileCache.setActiveFile(null)
		}

		// If the file isn't in the tree yet, load all parent directories first
		// This ensures the file appears in the sidebar after opening from command palette or restore
		const tree = state.tree
		if (tree && path) {
			const node = findNode(tree, path)
			if (!node) {
				// File not in tree - load parent directories
				const parentPath = path.split('/').slice(0, -1).join('/')
				if (parentPath) {
					await ensureDirPathLoaded(parentPath)
				}
			}
		}

		await selectPathInternal(path, options)
		const latestTree = state.tree
		if (latestTree) {
			const node = findNode(latestTree, path)
			if (node?.kind === 'file') {
				fileCache.setActiveFile(path)
			}
		}
	}

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
		clearFileCache: fileCache.clearMemory,
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
		setTree,
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
				const latestTree = state.tree
				if (!latestTree) return undefined
				const currentNode = findNode(latestTree, currentPath)
				if (!currentNode || currentNode.kind !== 'dir') {
					return undefined
				}
			} else {
				const currentNode = findNode(state.tree, currentPath)
				if (!currentNode || currentNode.kind !== 'dir') {
					return undefined
				}
			}
		}

		const latestTree = state.tree
		if (!latestTree) return undefined
		const node = findNode(latestTree, path)
		return node && node.kind === 'dir' ? node : undefined
	}

	const setSource = (source: FsSource) => refresh(source)

	const { startObserving, stopObserving } = useFileSystemObserver({
		state,
		reloadFile: async (path: string) => {
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
			void startObserving()
		})

		// Flush cache before page unload to persist view state (scroll, cursor, selection)
		// Note: lsCache.flush() is synchronous and runs first, so view state will be saved
		const handleFlush = () => {
			void fileCache.flush()
		}

		// Multiple events to catch all cases:
		// - beforeunload: standard page unload
		// - pagehide: more reliable in some browsers
		// - visibilitychange: mobile/tab switching
		window.addEventListener('beforeunload', handleFlush)
		window.addEventListener('pagehide', handleFlush)
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				handleFlush()
			}
		})

		onCleanup(() => {
			window.removeEventListener('beforeunload', handleFlush)
			window.removeEventListener('pagehide', handleFlush)
		})
	})

	// Listen for settings file changes from the UI
	// When settings UI saves, invalidate the editor cache so it reloads fresh content
	// Using onMount since this is a one-time event listener setup, not reactive
	onMount(() => {
		const handleSettingsFileChanged = async (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const { path } = event.detail
			// Clear the cache for this file so editor reloads from disk
			fileCache.clearContent(path)

			// If this file is currently selected, force reload it
			const normalizedPath = path.startsWith('/') ? path.slice(1) : path
			const currentPath = state.lastKnownFilePath
			const normalizedCurrent = currentPath?.startsWith('/')
				? currentPath.slice(1)
				: currentPath
			if (normalizedCurrent === normalizedPath) {
				await selectPath(path, { forceReload: true })
			}
		}

		window.addEventListener('settings-file-changed', handleSettingsFileChanged)
		onCleanup(() => {
			window.removeEventListener(
				'settings-file-changed',
				handleSettingsFileChanged
			)
		})
	})

	createEffect(() => {
		const node = state.selectedNode
		if (node?.kind === 'file') {
			localStorage.setItem('fs-last-known-file-path', node.path)
		}
	})

	onCleanup(() => {
		stopObserving()
		void disposeTreePrefetchClient()
		clearDeferredMetadata()
	})

	const isSelectedPath = createSelector(() => state.selectedPath)

	const pickNewRoot = async () => {
		if (state.activeSource !== 'local') return
		await doPick()
		invalidateFs('local')
		await refresh('local')
	}

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
			updateSelectedFileCursorPosition,
			updateSelectedFileSelections,
			setViewMode: setViewModeWithStats,
			fileCache,
			saveFile,
			setDirtyPath,
			pickNewRoot,
			collapseAll,
			setCreationState,
		},
	]

	return (
		<FsContext.Provider value={value}>
			{props.children}
			<LocalDirectoryFallbackModal />
		</FsContext.Provider>
	)
}
