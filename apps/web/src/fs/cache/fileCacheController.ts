import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'

export type FileCacheEntry = {
	pieceTable?: PieceTableSnapshot
	stats?: ParseResult
	previewBytes?: Uint8Array
	highlights?: TreeSitterCapture[]
	folds?: FoldRange[]
	brackets?: BracketInfo[]
	errors?: TreeSitterError[]
	lineStarts?: number[]
}

export type FileCacheController = {
	getAsync: (path: string) => Promise<FileCacheEntry>
	set: (path: string, entry: FileCacheEntry) => void
}
