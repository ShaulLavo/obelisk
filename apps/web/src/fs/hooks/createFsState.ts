/* eslint-disable solid/reactivity */
import type { FsFileTreeNode, FsTreeNode } from '@repo/fs'
import { createMemo, createSignal } from 'solid-js'
import { findNode } from '../runtime/tree'
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
import { createVisibleContentState } from './createVisibleContentState'

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

	const selectedNode = createMemo<FsTreeNode | undefined>(() =>
		tree ? findNode(tree, selectedPath()) : undefined
	)
	const lastKnownFileNode = createMemo<FsFileTreeNode | undefined>((prev) => {
		const node = selectedNode()
		const currentPath = selectedPath()
		
		// Handle special case for settings file
		if (currentPath === '/.system/settings.json') {
			return {
				kind: 'file',
				path: currentPath,
				name: 'settings.json',
				size: 0,
				lastModified: Date.now(),
			} as FsFileTreeNode
		}
		
		if (node?.kind === 'file') {
			return node
		}
		return prev
	})
	const lastKnownFilePath = () => lastKnownFileNode()?.path

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
			return path ? fileStats[path] : undefined
		},
		get selectedFilePieceTable() {
			const path = lastKnownFilePath()
			return path ? pieceTables[path] : undefined
		},
		get selectedFileHighlights() {
			const path = lastKnownFilePath()
			return path ? fileHighlights[path] : undefined
		},
		get selectedFileHighlightOffset() {
			const path = lastKnownFilePath()
			return path ? highlightOffsets[path] : undefined
		},
		get selectedFileFolds() {
			const path = lastKnownFilePath()
			return path ? fileFolds[path] : undefined
		},
		get selectedFileBrackets() {
			const path = lastKnownFilePath()
			return path ? fileBrackets[path] : undefined
		},
		get selectedFileErrors() {
			const path = lastKnownFilePath()
			return path ? fileErrors[path] : undefined
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
			return path ? scrollPositions[path] : undefined
		},
		get selectedFileVisibleContent() {
			const path = lastKnownFilePath()
			return path ? visibleContents[path] : undefined
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
		collapseAll,
		setCreationState,
	}
}
