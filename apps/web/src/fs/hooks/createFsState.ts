/* eslint-disable solid/reactivity */
import type { FsFileTreeNode, FsTreeNode } from '@repo/fs'
import { createEffect, createMemo, createSignal } from 'solid-js'
import { findNode } from '../runtime/tree'
import type { FsState } from '../types'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path
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
import { createVisibleContentState } from './createVisibleContentState'
import { createViewModeState } from './createViewModeState'

export const createFsState = () => {
	const { tree, setTree } = createTreeState()
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
	const { dirtyPaths, setDirtyPath, clearDirtyPaths } = createDirtyState()
	const { scrollPositions, setScrollPosition, clearScrollPositions } =
		createScrollPositionState()
	const { visibleContents, setVisibleContent, clearVisibleContents } =
		createVisibleContentState()
	const { fileViewModes, setViewMode, getViewMode, clearViewModes } =
		createViewModeState()

	const selectedNode = createMemo<FsTreeNode | undefined>(() =>
		tree ? findNode(tree, selectedPath()) : undefined
	)
	
	// Track the last known file path - this updates whenever a file path is selected,
	// even if the file isn't in the tree yet (e.g., .system files from OPFS)
	const [lastKnownFilePathSignal, setLastKnownFilePathSignal] = createSignal<string | undefined>(undefined)
	
	// Update lastKnownFilePath when selectedPath changes to a file
	createEffect(() => {
		const path = selectedPath()
		if (!path) return
		
		// Check if it's a file path (has an extension or is a known file)
		const node = tree ? findNode(tree, path) : undefined
		if (node?.kind === 'file') {
			setLastKnownFilePathSignal(path)
			return
		}
		
		// If node not found but path looks like a file (has extension), treat it as a file
		// This handles .system files that might not be in the tree yet
		if (!node && path.includes('.') && !path.endsWith('/')) {
			setLastKnownFilePathSignal(path)
		}
	})
	
	const lastKnownFileNode = createMemo<FsFileTreeNode | undefined>((prev) => {
		const path = lastKnownFilePathSignal()
		if (!path) return prev
		
		const node = tree ? findNode(tree, path) : undefined
		if (node?.kind === 'file') {
			return node
		}
		return prev
	})
	const lastKnownFilePath = () => lastKnownFilePathSignal()

	const [creationState, setCreationState] = createSignal<{
		type: 'file' | 'folder'
		parentPath: string
	} | null>(null)

	const state = {
		tree,
		expanded,
		fileStats,
		pieceTables,
		fileHighlights,
		highlightOffsets,
		fileFolds,
		fileBrackets,
		fileErrors,
		scrollPositions,
		visibleContents,
		fileViewModes,
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
		get selectedFileStats() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return fileStats[normalizePath(path)]
		},
		get selectedFilePieceTable() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return pieceTables[normalizePath(path)]
		},
		get selectedFileHighlights() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return fileHighlights[normalizePath(path)]
		},
		get selectedFileHighlightOffset() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return highlightOffsets[normalizePath(path)]
		},
		get selectedFileFolds() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return fileFolds[normalizePath(path)]
		},
		get selectedFileBrackets() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return fileBrackets[normalizePath(path)]
		},
		get selectedFileErrors() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return fileErrors[normalizePath(path)]
		},
		get selectedNode() {
			return selectedNode()
		},
		get lastKnownFileNode() {
			return lastKnownFileNode()
		},
		get lastKnownFilePath() {
			return lastKnownFilePath()
		},
		get dirtyPaths() {
			return dirtyPaths
		},
		get selectedFileScrollPosition() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return scrollPositions[normalizePath(path)]
		},
		get selectedFileVisibleContent() {
			const path = lastKnownFilePath()
			if (!path) return undefined
			return visibleContents[normalizePath(path)]
		},
		get selectedFileViewMode() {
			const path = lastKnownFilePath()
			if (!path) return 'editor'
			const normalized = normalizePath(path)
			return getViewMode(normalized, fileStats[normalized])
		},
	} satisfies FsState

	return {
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
		clearDirtyPaths,
		setScrollPosition,
		clearScrollPositions,
		setVisibleContent,
		clearVisibleContents,
		setViewMode,
		clearViewModes,
		collapseAll,
		setCreationState,
	}
}
