import type { Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils/parse'
import type { PieceTableSnapshot } from '@repo/utils'

export type VirtualItem = {
	index: number
	start: number
	size: number
}

// Bracket depth map: character index -> nesting depth
export type BracketDepthMap = Record<number, number>

// Bracket info from tree-sitter AST
export type BracketInfo = {
	index: number
	char: string
	depth: number
}
export type EditorSyntaxHighlight = {
	startIndex: number
	endIndex: number
	scope: string
}
export type LineHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

export type FoldRange = {
	startLine: number
	endLine: number
	type: string
}
export type EditorPoint = {
	row: number
	column: number
}

export type DocumentIncrementalEdit = {
	startIndex: number
	oldEndIndex: number
	newEndIndex: number
	startPosition: EditorPoint
	oldEndPosition: EditorPoint
	newEndPosition: EditorPoint
	deletedText: string
	insertedText: string
}

export type CursorMode = 'regular' | 'terminal'

export type EditorAreaRegistration = (
	resolver: () => HTMLElement | null
) => (() => void) | void

export type TextEditorDocument = {
	filePath: Accessor<string | undefined>
	content: Accessor<string>
	pieceTable: Accessor<PieceTableSnapshot | undefined>
	updatePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	isEditable: Accessor<boolean>
	applyIncrementalEdit?: (edit: DocumentIncrementalEdit) => void
}

export type EditorError = {
	startIndex: number
	endIndex: number
	message: string
	isMissing: boolean
}

export type EditorProps = {
	document: TextEditorDocument
	isFileSelected: Accessor<boolean>
	stats: Accessor<ParseResult | undefined>
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	cursorMode: Accessor<CursorMode>
	tabSize?: Accessor<number>
	registerEditorArea?: EditorAreaRegistration
	previewBytes?: Accessor<Uint8Array | undefined>
	activeScopes?: Accessor<string[]>
	highlights?: Accessor<EditorSyntaxHighlight[] | undefined>
	folds?: Accessor<FoldRange[] | undefined>
	brackets?: Accessor<BracketInfo[] | undefined>
	errors?: Accessor<EditorError[] | undefined>
}

export type LineEntry = {
	index: number
	start: number
	length: number
	text: string
}

export type LineProps = {
	virtualRow: VirtualItem
	entry: LineEntry
	lineHeight: number
	contentWidth: number
	charWidth: number
	tabSize: number
	isEditable: Accessor<boolean>
	onPreciseClick: (
		lineIndex: number,
		column: number,
		shiftKey?: boolean
	) => void
	onMouseDown?: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
	isActive: boolean
	bracketDepths: Accessor<BracketDepthMap | undefined>
	highlights?: LineHighlightSegment[]
}

export type LinesProps = {
	rows: Accessor<VirtualItem[]>
	contentWidth: Accessor<number>
	lineHeight: Accessor<number>
	charWidth: Accessor<number>
	tabSize: Accessor<number>
	isEditable: Accessor<boolean>
	onPreciseClick: (
		lineIndex: number,
		column: number,
		shiftKey?: boolean
	) => void
	onMouseDown?: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
	activeLineIndex: Accessor<number | null>
	bracketDepths: Accessor<BracketDepthMap | undefined>
	getLineHighlights?: (entry: LineEntry) => LineHighlightSegment[] | undefined
	/** Convert display row index to actual document line index */
	displayToLine?: (displayIndex: number) => number
}

export type LineGuttersProps = {
	rows: Accessor<VirtualItem[]>
	lineHeight: Accessor<number>
	onRowClick: (lineIndex: number) => void
	activeLineIndex: Accessor<number | null>
	folds?: Accessor<FoldRange[] | undefined>
	foldedStarts?: Accessor<Set<number>>
	onToggleFold?: (startLine: number) => void
	/** Convert display row index to actual document line index */
	displayToLine?: (displayIndex: number) => number
}

export type TextFileEditorProps = EditorProps
