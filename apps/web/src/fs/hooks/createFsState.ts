import type { FsTreeNode, FilePath } from '@repo/fs'
import { createMemo, createSignal } from 'solid-js'
import type { FsState } from '../types'

import { createTreeState } from './createTreeState'
import { createExpandedState } from './createExpandedState'
import { createSelectionState } from './createSelectionState'
import { createFileDisplayState } from './createFileDisplayState'
import { createPrefetchState } from './createPrefetchState'
import { createFileStore } from './createFileStore'

export const createFsState = () => {
	const treeState = createTreeState()
	const {
		pathIndex,
		setTreeRoot,
		updateTreeDirectory,
		updateTreeDirectories,
		addTreeNode,
		removeTreeNode,
		getNode,
	} = treeState
	const { expanded, setExpanded, collapseAll } = createExpandedState()
	const { selectedPath, setSelectedPath, activeSource, setActiveSource } =
		createSelectionState()
	const { loading, setLoading, saving, setSaving } = createFileDisplayState()
	const {
		backgroundPrefetching,
		setBackgroundPrefetching,
		backgroundIndexedFileCount,
		setBackgroundIndexedFileCount,
		lastPrefetchedPath,
		setLastPrefetchedPath,
		prefetchError,
		setPrefetchError,
		prefetchProcessedCount,
		setPrefetchProcessedCount,
		prefetchLastDurationMs,
		setPrefetchLastDurationMs,
		prefetchAverageDurationMs,
		setPrefetchAverageDurationMs,
		deferredMetadata,
		registerDeferredMetadata,
		clearDeferredMetadata,
	} = createPrefetchState()

	const fileStore = createFileStore()

	const selectedNode = createMemo<FsTreeNode | undefined>(() => {
		const path = selectedPath()
		return path ? getNode(path) : undefined
	})

	const [creationState, setCreationState] = createSignal<{
		type: 'file' | 'folder'
		parentPath: FilePath
	} | null>(null)

	const state = {
		get tree() {
			return treeState.tree
		},
		pathIndex,
		expanded,
		files: fileStore.files,
		highlightOffsets: fileStore.highlightOffsets,
		get creationState() {
			return creationState()
		},
		get selectedPath() {
			return selectedPath()
		},
		get activeSource() {
			return activeSource()
		},
		get loading() {
			return loading()
		},
		get saving() {
			return saving()
		},
		get backgroundPrefetching() {
			return backgroundPrefetching()
		},
		get backgroundIndexedFileCount() {
			return backgroundIndexedFileCount()
		},
		get lastPrefetchedPath() {
			return lastPrefetchedPath()
		},
		get prefetchError() {
			return prefetchError()
		},
		get prefetchProcessedCount() {
			return prefetchProcessedCount()
		},
		get prefetchLastDurationMs() {
			return prefetchLastDurationMs()
		},
		get prefetchAverageDurationMs() {
			return prefetchAverageDurationMs()
		},
		get deferredMetadata() {
			return deferredMetadata
		},
		get selectedNode() {
			return selectedNode()
		},
	} satisfies FsState

	return {
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
		setBackgroundPrefetching,
		setBackgroundIndexedFileCount,
		setLastPrefetchedPath,
		setPrefetchError,
		setPrefetchProcessedCount,
		setPrefetchLastDurationMs,
		setPrefetchAverageDurationMs,
		registerDeferredMetadata,
		clearDeferredMetadata,
		collapseAll,
		setCreationState,
		setFileStats: fileStore.setStats,
		setPieceTable: fileStore.setPieceTable,
		setSyntax: fileStore.setSyntax,
		setHighlights: fileStore.setHighlights,
		applyHighlightOffset: fileStore.applyHighlightOffset,
		setFolds: fileStore.setFolds,
		setBrackets: fileStore.setBrackets,
		setErrors: fileStore.setErrors,
		setDirty: fileStore.setDirty,
		setSavedContent: fileStore.setSavedContent,
		clearSavedContent: fileStore.clearSavedContent,
		updateDirtyFromPieceTable: fileStore.updateDirtyFromPieceTable,
		setLoadingState: fileStore.setLoadingState,
		setLoadingError: fileStore.setLoadingError,
		setLineStarts: fileStore.setLineStarts,
		preloadFileContent: fileStore.preloadFileContent,
		clearFileState: fileStore.removeFile,
		clearAllFileState: fileStore.clearAll,
		clearSyntax: fileStore.clearSyntax,
	}
}
