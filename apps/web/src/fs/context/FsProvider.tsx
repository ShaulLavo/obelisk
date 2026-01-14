import type { DirTreeNode } from '@repo/fs'
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
import { FsContext, type FsContextValue } from './FsContext'
import { makeTreePrefetch } from '../hooks/useTreePrefetch'
import { useDirectoryLoader } from '../hooks/useDirectoryLoader'
import { useFileSelection } from '../hooks/useFileSelection'
import { useFsRefresh } from '../hooks/useFsRefresh'
import { LocalDirectoryFallbackModal } from '../components/LocalDirectoryFallbackModal'
import { getRootHandle, invalidateFs } from '../runtime/fsRuntime'
import { useFileSystemObserver } from '../hooks/useFileSystemObserver'
import { pickNewLocalRoot as doPick } from '@repo/fs'
import { createFileCacheController } from '../cache'

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
		setLoading,
		setSaving,
		setPieceTable,
		setDirty,
		setSavedContent,
		updateDirtyFromPieceTable,
		setBackgroundPrefetching,
		setBackgroundIndexedFileCount,
		setLastPrefetchedPath,
		setPrefetchError,
		setPrefetchProcessedCount,
		setPrefetchLastDurationMs,
		setPrefetchAverageDurationMs,
		clearDeferredMetadata,
		collapseAll,
		setCreationState,
		setLoadingState,
		setLoadingError,
		setLineStarts,
		preloadFileContent,
		clearFileState,
		clearAllFileState,
		clearSyntax,
		setSyntax,
	} = createFsState()

	const fileCache = createFileCacheController()

	const {
		selectPath: selectPathInternal,
		updatePieceTableForPath,
		setPieceTableContent,
	} = useFileSelection({
		state,
		setSelectedPath,
		setPieceTable,
		setDirty,
		setSavedContent,
		setSyntax,
		updateDirtyFromPieceTable,
		fileCache,
	})

	const setDirNode = (path: string, node: DirTreeNode) => {
		if (!path) {
			setTreeRoot(node)
			return
		}
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

	const { buildEnsurePaths, ensureDirLoaded, toggleDir } = useDirectoryLoader({
		state,
		setExpanded,
		setSelectedPath,
		setDirNode,
		runPrefetchTask,
		treePrefetchClient,
	})

	const selectPath = async (
		path: string,
		options?: { forceReload?: boolean }
	) => {
		if (path) {
			const node = getNode(path)
			if (!node) {
				const parentPath = path.split('/').slice(0, -1).join('/')
				if (parentPath) {
					await ensureDirPathLoaded(parentPath)
				}
			}
		}

		await selectPathInternal(path, options)
	}

	const { refresh } = useFsRefresh({
		state,
		setTreeRoot,
		setExpanded,
		setActiveSource,
		setLoading,
		clearAllFileState,
		clearSyntax,
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
		setPieceTable,
		setSaving,
		setDirty,
		setSavedContent,
		getState: () => state,
		getActiveSource: () => state.activeSource,
	})

	const ensureDirPathLoaded = async (
		path: string
	): Promise<DirTreeNode | undefined> => {
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
	})

	onMount(() => {
		const handleSettingsFileChanged = async (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const { path } = event.detail
			const normalizedPath = createFilePath(path)
			clearFileState(normalizedPath)

			if (state.selectedPath === normalizedPath) {
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
		const source = state.activeSource
		if (source && source !== 'local') return

		try {
			await doPick()
			invalidateFs('local')
			await refresh('local')
		} catch (error) {
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
			setSelectedPathOnly: setSelectedPath,
			isSelectedPath,
			createDir,
			createFile,
			deleteNode,
			ensureDirPathLoaded,
			updatePieceTableForPath,
			fileCache,
			saveFile,
			setDirty,
			setSavedContent,
			setPieceTableContent,
			pickNewRoot,
			collapseAll,
			setCreationState,
			setLoadingState,
			setLoadingError,
			setLineStarts: (path: string, lineStarts: number[]) => setLineStarts(path, lineStarts),
			preloadFileContent,
			clearFileState,
			setSyntax,
		},
	]

	return (
		<FsContext.Provider value={value}>
			{props.children}
			<LocalDirectoryFallbackModal />
		</FsContext.Provider>
	)
}
