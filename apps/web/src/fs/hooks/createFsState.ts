/* eslint-disable solid/reactivity */
import type { FsTreeNode, FilePath } from '@repo/fs'
import { createMemo, createSignal } from 'solid-js'
import type { FsState } from '../types'

import { createTreeState } from './createTreeState'
import { createExpandedState } from './createExpandedState'
import { createSelectionState } from './createSelectionState'
import { createFileDisplayState } from './createFileDisplayState'
import { createPrefetchState } from './createPrefetchState'
import { createFileStatsState } from './createFileStatsState'
import { createPieceTableState } from './createPieceTableState'
import { createHighlightState } from './createHighlightState'
import { createFoldState } from './createFoldState'
import { createBracketState } from './createBracketState'
import { createDirtyState } from './createDirtyState'
import { createErrorState } from './createErrorState'
import { createScrollPositionState } from './createScrollPositionState'
import { createCursorPositionState } from './createCursorPositionState'
import { createSelectionsState } from './createSelectionsState'
import { createVisibleContentState } from './createVisibleContentState'
import { createViewModeState } from './createViewModeState'
import { createFileLoadingStateStore } from './createFileLoadingStateStore'

export const createFsState = () => {
	const treeState = createTreeState()
	const { pathIndex, setTreeRoot, updateTreeDirectory, updateTreeDirectories, addTreeNode, removeTreeNode, getNode } = treeState
	const { expanded, setExpanded, collapseAll } = createExpandedState()
	const { selectedPath, setSelectedPath, activeSource, setActiveSource } =
		createSelectionState()
	const {
		selectedFileSize,
		setSelectedFileSize,
		selectedFilePreviewBytes,
		setSelectedFilePreviewBytes,
		selectedFileContent,
		setSelectedFileContent,
		selectedFileLoading,
		setSelectedFileLoading,
		loading,
		setLoading,
		saving,
		setSaving,
	} = createFileDisplayState()
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
	const { fileStats, setFileStats, clearParseResults } = createFileStatsState()
	const { pieceTables, setPieceTable, clearPieceTables } =
		createPieceTableState()
	const {
		fileHighlights,
		highlightOffsets,
		setHighlights,
		applyHighlightOffset,
		clearHighlights,
	} = createHighlightState()
	const { fileFolds, setFolds, clearFolds } = createFoldState()
	const { fileBrackets, setBrackets, clearBrackets } = createBracketState()
	const { fileErrors, setErrors, clearErrors } = createErrorState()
	const {
		dirtyPaths,
		setDirtyPath,
		setSavedContent,
		clearSavedContent,
		updateDirtyFromPieceTable,
		clearDirtyPaths,
	} = createDirtyState()
	const { scrollPositions, setScrollPosition, clearScrollPositions } =
		createScrollPositionState()
	const { cursorPositions, setCursorPosition, clearCursorPositions } =
		createCursorPositionState()
	const { fileSelections, setSelections, clearSelections } =
		createSelectionsState()
	const { visibleContents, setVisibleContent, clearVisibleContents } =
		createVisibleContentState()
	const { fileViewModes, setViewMode, getViewMode, clearViewModes } =
		createViewModeState()
	const {
		fileLoadingStatus,
		fileLoadingErrors,
		fileLineStarts,
		setFileLoadingStatus,
		setFileLoadingError,
		setFileLineStarts,
		preloadFileContent,
		clearFileLoadingState,
		clearAllFileLoadingState,
	} = createFileLoadingStateStore()

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
		fileStats,
		pieceTables,
		fileHighlights,
		highlightOffsets,
		fileFolds,
		fileBrackets,
		fileErrors,
		scrollPositions,
		cursorPositions,
		fileSelections,
		visibleContents,
		fileViewModes,
		fileLoadingStatus,
		fileLoadingErrors,
		fileLineStarts,
		get creationState() {
			return creationState()
		},
		get selectedPath() {
			return selectedPath()
		},
		get selectedFileLoading() {
			return selectedFileLoading()
		},
		get activeSource() {
			return activeSource()
		},
		get selectedFileContent() {
			return selectedFileContent()
		},
		get selectedFileSize() {
			return selectedFileSize()
		},
		get selectedFilePreviewBytes() {
			return selectedFilePreviewBytes()
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
		get dirtyPaths() {
			return dirtyPaths
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
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
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
		setFileStats,
		clearParseResults,
		setPieceTable,
		clearPieceTables,
		setHighlights,
		applyHighlightOffset,
		clearHighlights,
		setFolds,
		clearFolds,
		setBrackets,
		clearBrackets,
		setErrors,
		clearErrors,
		setDirtyPath,
		setSavedContent,
		clearSavedContent,
		updateDirtyFromPieceTable,
		clearDirtyPaths,
		setScrollPosition,
		clearScrollPositions,
		setCursorPosition,
		clearCursorPositions,
		setSelections,
		clearSelections,
		setVisibleContent,
		clearVisibleContents,
		setViewMode,
		clearViewModes,
		collapseAll,
		setCreationState,
		setFileLoadingStatus,
		setFileLoadingError,
		setFileLineStarts,
		preloadFileContent,
		clearFileLoadingState,
		clearAllFileLoadingState,
	}
}
