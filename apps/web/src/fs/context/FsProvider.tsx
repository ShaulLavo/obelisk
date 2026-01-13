import type { FsDirTreeNode } from '@repo/fs'
import { createFilePath } from '@repo/fs'
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
import { makeTreePrefetch } from '../hooks/useTreePrefetch'
import { useDirectoryLoader } from '../hooks/useDirectoryLoader'
import { useFileSelection } from '../hooks/useFileSelection'
import { useFsRefresh } from '../hooks/useFsRefresh'
import { createFileCacheControllerV2 } from '../cache/fileCacheController'
import { LocalDirectoryFallbackModal } from '../components/LocalDirectoryFallbackModal'
import { getRootHandle, invalidateFs } from '../runtime/fsRuntime'
import { useFileSystemObserver } from '../hooks/useFileSystemObserver'
import { pickNewLocalRoot as doPick } from '@repo/fs'
export function FsProvider(props: { children: JSX.Element }) {
	const {
		state,
		setTreeRoot,
		updateTreeDirectory,
		updateTreeDirectories,
		addTreeNode,
		removeTreeNode,
		getNode,
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

	const setDirNode = (path: string, node: FsDirTreeNode) => {
		if (!path) {
			// Setting root - use setTreeRoot for full index rebuild
			setTreeRoot(node)
			return
		}
		// Update directory children - uses incremental index update
		updateTreeDirectory(path, node.children)
	}

	const { treePrefetchClient, runPrefetchTask, disposeTreePrefetchClient } =
		makeTreePrefetch({
			updateTreeDirectories,
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
		if (path) {
			const node = getNode(path)
			if (!node) {
				// File not in tree - load parent directories
				const parentPath = path.split('/').slice(0, -1).join('/')
				if (parentPath) {
					await ensureDirPathLoaded(parentPath)
				}
			}
		}

		await selectPathInternal(path, options)
		const node = getNode(path)
		if (node?.kind === 'file') {
			fileCache.setActiveFile(path)
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
		setTreeRoot,
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
		addTreeNode,
		removeTreeNode,
		getNode,
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
		if (!state.tree) return undefined
		if (!path) {
			return state.tree
		}

		const segments = path.split('/').filter(Boolean)
		let currentPath = ''

		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			const load = ensureDirLoaded(currentPath)
			if (load) {
				await load
				if (!state.tree) return undefined
				const currentNode = getNode(currentPath)
				if (!currentNode || currentNode.kind !== 'dir') {
					return undefined
				}
			} else {
				const currentNode = getNode(currentPath)
				if (!currentNode || currentNode.kind !== 'dir') {
					return undefined
				}
			}
		}

		if (!state.tree) return undefined
		const node = getNode(path)
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
			const normalizedPath = createFilePath(path)
			fileCache.clearContent(normalizedPath)

			if (state.lastKnownFilePath === normalizedPath) {
				await selectPath(normalizedPath, { forceReload: true })
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

	const selectedPathSelector = createSelector(() => state.selectedPath)
	const isSelectedPath = (path: string | undefined) =>
		selectedPathSelector(path ? createFilePath(path) : undefined)

	const pickNewRoot = async () => {
		// Allow picking if:
		// - No tree loaded yet (initial state)
		// - Already on local source
		// Block only if explicitly on a different source (memory/opfs)
		const source = state.activeSource
		if (source && source !== 'local') return

		try {
			await doPick()
			invalidateFs('local')
			await refresh('local')
		} catch (error) {
			// User cancelled or picker failed - ignore
			if (error instanceof Error && error.name === 'AbortError') return
			console.error('[pickNewRoot] Failed:', error)
		}
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
