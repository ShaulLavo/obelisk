import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'

export type DocumentCacheEntry = {
	pieceTable?: PieceTableSnapshot
	stats?: ParseResult
	previewBytes?: Uint8Array
	highlights?: TreeSitterCapture[]
	folds?: FoldRange[]
	brackets?: BracketInfo[]
	errors?: TreeSitterError[]
	lineStarts?: number[]
}

export type DocumentCache = {
	getAsync: (path: string) => Promise<DocumentCacheEntry>
	set: (path: string, entry: DocumentCacheEntry) => void
}
