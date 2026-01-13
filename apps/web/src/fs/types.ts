import type { FsDirTreeNode, FsTreeNode, FilePath } from '@repo/fs'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../workers/treeSitter/types'
import type { DeferredDirMetadata } from './prefetch/treePrefetchWorkerTypes'
import type { ScrollPosition, HighlightTransform, CursorPosition, SelectionRange } from './store/types'
import type { ViewMode } from './types/ViewMode'
import type {
	FileLoadingError,
	FileLoadingStatus,
} from '../split-editor/fileLoadingErrors'

export type FsSource = 'memory' | 'local' | 'opfs'

export type FsState = {
	tree?: FsDirTreeNode
	pathIndex: Record<FilePath, FsTreeNode>
	expanded: Record<FilePath, boolean>
	selectedPath?: FilePath
	activeSource: FsSource
	selectedFileLoading: boolean
	selectedFileContent: string
	selectedFilePreviewBytes?: Uint8Array
	selectedFileSize?: number
	loading: boolean
	saving: boolean
	backgroundPrefetching: boolean
	backgroundIndexedFileCount: number
	lastPrefetchedPath?: FilePath
	prefetchError?: string
	prefetchProcessedCount: number
	prefetchLastDurationMs: number
	prefetchAverageDurationMs: number
	fileStats: Record<FilePath, ParseResult | undefined>
	pieceTables: Record<FilePath, PieceTableSnapshot | undefined>
	fileHighlights: Record<FilePath, TreeSitterCapture[] | undefined>
	/** Pending offset transforms for optimistic updates (ordered oldest -> newest) */
	highlightOffsets: Record<FilePath, HighlightTransform[] | undefined>
	fileFolds: Record<FilePath, FoldRange[] | undefined>
	fileBrackets: Record<FilePath, BracketInfo[] | undefined>
	fileErrors: Record<FilePath, TreeSitterError[] | undefined>
	selectedNode?: FsTreeNode | undefined
	deferredMetadata: Record<FilePath, DeferredDirMetadata>
	dirtyPaths: Record<FilePath, boolean>
	scrollPositions: Record<FilePath, ScrollPosition | undefined>
	/** Cursor positions for each file */
	cursorPositions: Record<FilePath, CursorPosition | undefined>
	/** Selection ranges for each file */
	fileSelections: Record<FilePath, SelectionRange[] | undefined>
	/** Pre-computed visible content for instant tab switching */
	visibleContents: Record<FilePath, VisibleContentSnapshot | undefined>
	/** Current view mode for each file */
	fileViewModes: Record<FilePath, ViewMode>
	creationState?: {
		type: 'file' | 'folder'
		parentPath: FilePath
	} | null
	/** Loading status per file (for split editor) */
	fileLoadingStatus: Record<FilePath, FileLoadingStatus>
	/** Loading errors per file (for split editor) */
	fileLoadingErrors: Record<FilePath, FileLoadingError | null>
	/** Precomputed line starts per file (for editor performance) */
	fileLineStarts: Record<FilePath, number[]>
}
