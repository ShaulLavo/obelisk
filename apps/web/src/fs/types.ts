import type { FsDirTreeNode, FsFileTreeNode, FsTreeNode } from '@repo/fs'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../workers/treeSitterWorkerTypes'
import type { DeferredDirMetadata } from './prefetch/treePrefetchWorkerTypes'

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
	error?: string
	loading: boolean
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
	selectedFileHighlights?: TreeSitterCapture[]
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
}
