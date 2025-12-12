/* eslint-disable solid/reactivity */
import type { FsTreeNode } from '@repo/fs'
import { createMemo } from 'solid-js'
import { getPieceTableText } from '@repo/utils'
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
import { createErrorState } from './createErrorState'

export const createFsState = () => {
	const { tree, setTree } = createTreeState()
	const { expanded, setExpanded } = createExpandedState()
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
		error,
		setError,
		loading,
		setLoading
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
		clearDeferredMetadata
	} = createPrefetchState()
	const { fileStats, setFileStats, clearParseResults } = createFileStatsState()
	const { pieceTables, setPieceTable, clearPieceTables } =
		createPieceTableState()
	const { fileHighlights, setHighlights, clearHighlights } =
		createHighlightState()
	const { fileFolds, setFolds, clearFolds } = createFoldState()
	const { fileBrackets, setBrackets, clearBrackets } =
		createBracketState()
	const { fileErrors, setErrors, clearErrors } =
		createErrorState()

	const selectedNode = createMemo<FsTreeNode | undefined>(() =>
		tree ? findNode(tree, selectedPath()) : undefined
	)
	const lastKnownFileNode = createMemo<FsTreeNode | undefined>(prev => {
		const node = selectedNode()
		if (node?.kind === 'file') {
			return node
		}
		return prev
	})
	const lastKnownFilePath = () => lastKnownFileNode()?.path

	const state = {
		tree,
		expanded,
		fileStats,
		pieceTables,
		fileHighlights,
		fileFolds,
		fileBrackets,
		fileErrors,
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
			const path = lastKnownFilePath()
			const currentPath = selectedPath()
			if (!path || currentPath !== path) {
				return selectedFileContent()
			}

			const snapshot = pieceTables[path]
			if (snapshot) {
				return getPieceTableText(snapshot)
			}

			return selectedFileContent()
		},
		get selectedFileSize() {
			return selectedFileSize()
		},
		get selectedFilePreviewBytes() {
			return selectedFilePreviewBytes()
		},
		get error() {
			return error()
		},
		get loading() {
			return loading()
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
		}
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
		setError,
		setLoading,
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
		clearHighlights,
		setFolds,
		clearFolds,
		setBrackets,
		clearBrackets,
		setErrors,
		clearErrors
	}
}
