import type { Accessor } from 'solid-js'
import type { FilePath } from '@repo/fs'
import type { ParseResult, PieceTableSnapshot } from '@repo/utils'
import type {
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	FoldRange,
} from '../../workers/treeSitter/types'
import type { FileLoadingError } from '../../split-editor/fileLoadingErrors'

export interface TextEdit {
	readonly startOffset: number
	readonly endOffset: number
	readonly newText: string
}

export interface HighlightTransform {
	readonly charDelta: number
	readonly lineDelta: number
	readonly fromCharIndex: number
	readonly fromLineRow: number
	readonly oldEndRow: number
	readonly newEndRow: number
	readonly oldEndIndex: number
	readonly newEndIndex: number
}

export interface SharedBuffer {
	readonly filePath: FilePath
	readonly content: Accessor<string>
	readonly contentVersion: Accessor<number>
	setContent: (content: string) => void
	applyEdit: (edit: TextEdit) => Promise<void>
	onEdit: (callback: (edit: TextEdit) => void) => () => void
	dispose: () => void
}

export type FileLoadingState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'loaded' }
	| { status: 'error'; error: FileLoadingError }

export interface SyntaxData {
	readonly highlights: TreeSitterCapture[]
	readonly brackets: BracketInfo[]
	readonly folds: FoldRange[]
	readonly errors: TreeSitterError[]
}

export interface FileState {
	readonly path: FilePath
	pieceTable: PieceTableSnapshot | null
	stats: ParseResult | null
	syntax: SyntaxData | null
	loadingState: FileLoadingState
	isDirty: boolean
	lastAccessed: number
	diskMtime: number | null
	previewBytes: Uint8Array | null
	lineStarts: number[] | null
}

export function createEmptyFileState(path: FilePath): FileState {
	return {
		path,
		pieceTable: null,
		stats: null,
		syntax: null,
		loadingState: { status: 'idle' },
		isDirty: false,
		lastAccessed: Date.now(),
		diskMtime: null,
		previewBytes: null,
		lineStarts: null,
	}
}

