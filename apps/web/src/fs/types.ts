import type { FsDirTreeNode, FsFileTreeNode, FsTreeNode } from '@repo/fs'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from '@repo/code-editor'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../workers/treeSitter/types'
import type { DeferredDirMetadata } from './prefetch/treePrefetchWorkerTypes'
import type { ScrollPosition } from './cache/fileCacheController'
import type { HighlightTransform } from './hooks/createHighlightState'

export type FsSource = 'memory' | 'local' | 'opfs'

export type FsState = {
	tree?: FsDirTreeNode
	expanded: Record<string, boolean>
	selectedPath?: string
	activeSource: FsSource
	selectedFileLoading: boolean
	selectedFileContent: string
	selectedFilePreviewBytes?: Uint8Array
	selectedFileSize?: number
	loading: boolean
	saving: boolean
	backgroundPrefetching: boolean
	backgroundIndexedFileCount: number
	lastPrefetchedPath?: string
	prefetchError?: string
	prefetchProcessedCount: number
	prefetchLastDurationMs: number
	prefetchAverageDurationMs: number
	fileStats: Record<string, ParseResult | undefined>
	selectedFileStats?: ParseResult
	pieceTables: Record<string, PieceTableSnapshot | undefined>
	selectedFilePieceTable?: PieceTableSnapshot
	fileHighlights: Record<string, TreeSitterCapture[] | undefined>
	/** Pending offset transforms for optimistic updates (ordered oldest -> newest) */
	highlightOffsets: Record<string, HighlightTransform[] | undefined>
	selectedFileHighlights?: TreeSitterCapture[]
	selectedFileHighlightOffset?: HighlightTransform[]
	fileFolds: Record<string, FoldRange[] | undefined>
	selectedFileFolds?: FoldRange[]
	fileBrackets: Record<string, BracketInfo[] | undefined>
	selectedFileBrackets?: BracketInfo[]
	fileErrors: Record<string, TreeSitterError[] | undefined>
	selectedFileErrors?: TreeSitterError[]
	selectedNode?: FsTreeNode | undefined
	lastKnownFileNode?: FsFileTreeNode | undefined
	lastKnownFilePath?: string
	deferredMetadata: Record<string, DeferredDirMetadata>
	dirtyPaths: Record<string, boolean>
	scrollPositions: Record<string, ScrollPosition | undefined>
	selectedFileScrollPosition?: ScrollPosition
	/** Pre-computed visible content for instant tab switching */
	visibleContents: Record<string, VisibleContentSnapshot | undefined>
	selectedFileVisibleContent?: VisibleContentSnapshot
	creationState?: {
		type: 'file' | 'folder'
		parentPath: string
	} | null
}
