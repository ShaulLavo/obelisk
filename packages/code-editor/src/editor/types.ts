import type { Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils/parse'
import type { PieceTableSnapshot } from '@repo/utils'
import type { VisibleContentSnapshot } from './types/visibleContentCache'
import type { TextRun } from './line/utils/textRuns'

export type VirtualItem = {
	index: number
	start: number
	size: number
}

export type VirtualItem2D = VirtualItem & {
	columnStart: number
	columnEnd: number
	lineId: number
}

// Bracket depth map: character index -> nesting depth
export type BracketDepthMap = Record<number, number>
// Line bracket depth map: offset-in-line -> nesting depth
export type LineBracketDepthMap = Record<number, number>

export type EditorSyntaxHighlight = {
	startIndex: number
	endIndex: number
	scope: string
	/** Precomputed CSS class for the scope (filled by the editor) */
	className?: string
}
export type LineHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

/**
 * Offset transformation for optimistic highlight updates.
 * Applied lazily per-line instead of recreating all highlight objects.
 */
export type HighlightOffset = {
	charDelta: number
	lineDelta: number
	fromCharIndex: number
	fromLineRow: number
	/** Old end row for the edit range (pre-edit coordinates). */
	oldEndRow: number
	/** New end row for the edit range (post-edit coordinates). */
	newEndRow: number
	/** Old end index for the edit range (pre-edit coordinates). */
	oldEndIndex: number
	/** New end index for the edit range (post-edit coordinates). */
	newEndIndex: number
}

/**
 * Ordered list of pending edit offsets (oldest -> newest).
 */
export type HighlightOffsets = HighlightOffset[]

export type FoldRange = {
	startLine: number
	endLine: number
	type: string
}
export type BracketInfo = {
	index: number
	char: string
	depth: number
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
	/** Offset for optimistic highlight updates - applied lazily per-line */
	highlightOffset?: Accessor<HighlightOffsets | undefined>
	folds?: Accessor<FoldRange[] | undefined>
	brackets?: Accessor<BracketInfo[] | undefined>
	errors?: Accessor<EditorError[] | undefined>
	/** Tree-sitter worker for minimap communication */
	treeSitterWorker?: Worker
	/** Document version for minimap re-render */
	documentVersion?: Accessor<number>
	onSave?: () => void
	/** Initial scroll position to restore when switching back to this file */
	initialScrollPosition?: Accessor<ScrollPosition | undefined>
	/** Called when scroll position changes to save for later restoration */
	onScrollPositionChange?: (position: ScrollPosition) => void
	/** Initial visible content snapshot for instant rendering on tab switch */
	initialVisibleContent?: Accessor<VisibleContentSnapshot | undefined>
	/** Called to capture visible content when switching away from this file */
	onCaptureVisibleContent?: (snapshot: VisibleContentSnapshot) => void
}

export type ScrollPosition = {
	lineIndex: number
	scrollLeft: number
}

export type LineEntry = {
	lineId: number
	index: number
	start: number
	length: number
	text: string
}

export type LineProps = {
	virtualRow: VirtualItem2D
	columnEndOverride?: number
	lineIndex: number
	lineText: string
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
	lineBracketDepths?: LineBracketDepthMap
	highlights?: LineHighlightSegment[]
	/** Pre-computed TextRuns from cache for instant rendering */
	cachedRuns?: TextRun[]
}

export type LinesProps = {
	rows: Accessor<VirtualItem2D[]>
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
	getLineBracketDepths: (entry: LineEntry) => LineBracketDepthMap | undefined
	getLineHighlights?: (entry: LineEntry) => LineHighlightSegment[] | undefined
	highlightRevision?: Accessor<number>
	/** Get cached TextRuns for a line (for instant rendering on tab switch) */
	getCachedRuns?: (
		lineIndex: number,
		columnStart: number,
		columnEnd: number,
		lineId?: number
	) => TextRun[] | undefined
	/** Convert display row index to actual document line index */
	displayToLine?: (displayIndex: number) => number
}

export type LineGuttersProps = {
	rows: Accessor<VirtualItem2D[]>
	lineHeight: Accessor<number>
	gutterWidth: Accessor<number>
	onRowClick: (lineIndex: number) => void
	activeLineIndex: Accessor<number | null>
	folds?: Accessor<FoldRange[] | undefined>
	foldedStarts?: Accessor<Set<number>>
	onToggleFold?: (startLine: number) => void
	/** Convert display row index to actual document line index */
	displayToLine?: (displayIndex: number) => number
}
