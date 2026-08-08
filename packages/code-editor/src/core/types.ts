/**
 * Core editor types — framework-free, no Solid dependencies.
 *
 * These types define the authoritative data model for the editor runtime.
 * They are the single source of truth referenced by EditorCore, FrameScheduler,
 * EditorView, InputController, and all subsystems.
 */

import type { PieceTableSnapshot } from '@repo/utils'

// ---------------------------------------------------------------------------
// Document Identity
// ---------------------------------------------------------------------------

export type DocumentIdentity = {
	/** Unique per editor session instance. */
	sessionId: string
	/** Stable host-level identity for persistence and shell coordination. */
	documentKey: string
	/** Increments whenever a new document instance replaces the current one. */
	documentIncarnation: number
}

// ---------------------------------------------------------------------------
// Version Counters
// ---------------------------------------------------------------------------

export type VersionCounters = {
	/** Increments on every text mutation. */
	docVersion: number
	/** Increments when line count or line ordering changes. */
	structureVersion: number
	/** Increments on selection/cursor changes. */
	selectionVersion: number
	/** Increments on scroll/size/visible range changes. */
	viewportVersion: number
	/** Increments when async decoration data is applied. */
	decorationVersion: number
	/** Increments on theme/font-affecting render changes. */
	themeVersion: number
}

// ---------------------------------------------------------------------------
// Line Record
// ---------------------------------------------------------------------------

export type LineRecord = {
	id: number
	start: number
	length: number
	textLength: number
	revision: number
}

// ---------------------------------------------------------------------------
// Document Model
// ---------------------------------------------------------------------------

export type DocumentModel = {
	pieceTable: PieceTableSnapshot
	length: number
	lineStarts: number[]
	lineIds: number[]
	lineIndexById: Map<number, number>
	lineRecordsById: Map<number, LineRecord>
	nextLineId: number
}

// ---------------------------------------------------------------------------
// Selection and Cursor
// ---------------------------------------------------------------------------

export type SelectionRange = {
	anchor: number
	focus: number
}

export type CompositionState = {
	/** Offset where the composition text starts in the document. */
	start: number
	/** Length of the current composition text. */
	length: number
	/** The text being composed. */
	text: string
}

export type CursorModel = {
	selections: SelectionRange[]
	preferredColumn: number | null
	mode: 'regular' | 'terminal'
	composition: CompositionState | null
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export type ViewportState = {
	scrollTop: number
	scrollLeft: number
	viewportWidth: number
	viewportHeight: number
}

// ---------------------------------------------------------------------------
// Dirty State
// ---------------------------------------------------------------------------

export type ScrollAnchorHint =
	| { kind: 'delta'; deltaPx: number }
	| { kind: 'anchor'; lineId: number; offsetPx: number }

export type EditorDirtyState = {
	identity: DocumentIdentity
	docVersion: number
	decorationVersion: number
	text: boolean
	gutter: boolean
	overlay: boolean
	viewport: boolean
	fullMeasure: boolean
	lineRange: { start: number; end: number } | null
	decorationLineIds: number[] | null
	scrollAnchor: ScrollAnchorHint | null
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type OffsetMappingHint = {
	ranges: Array<{
		oldStart: number
		oldEnd: number
		newEnd: number
	}>
}

export type EditorDocumentInput = {
	key: string
	content: string
	pieceTable?: PieceTableSnapshot
}

export type EditorTransaction =
	| { type: 'insert-text'; text: string }
	| { type: 'replace-range'; start: number; end: number; text: string }
	| { type: 'delete-backward'; byWord?: boolean }
	| { type: 'delete-forward'; byWord?: boolean }
	| {
			type: 'move-cursor'
			direction: 'left' | 'right' | 'up' | 'down'
			byWord?: boolean
			extend?: boolean
	  }
	| { type: 'move-cursor-home'; extend?: boolean; toDocument?: boolean }
	| { type: 'move-cursor-end'; extend?: boolean; toDocument?: boolean }
	| {
			type: 'move-cursor-page'
			direction: 'up' | 'down'
			visibleLines: number
			extend?: boolean
	  }
	| {
			type: 'set-cursor-from-point'
			line: number
			column: number
			extend?: boolean
	  }
	| { type: 'set-selection'; anchor: number; focus: number }
	| { type: 'select-all' }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'set-fold-state'; startLineId: number; folded: boolean }
	| { type: 'replace-document'; document: EditorDocumentInput }
	| {
			type: 'replace-content'
			content: string
			remapHint?: OffsetMappingHint
	  }
	| { type: 'apply-edits'; edits: AtomicEdit[] }

/** A single edit within an atomic batch. Edits are applied in offset order. */
export type AtomicEdit = {
	start: number
	end: number
	text: string
}

// ---------------------------------------------------------------------------
// Dispatch Result
// ---------------------------------------------------------------------------

export type DispatchResult =
	| { ok: true; dirty: EditorDirtyState }
	| { ok: false; error: unknown }

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type HistoryMergeMode = 'insert' | 'delete'

export type HistoryEntry = {
	offset: number
	insertedText: string
	deletedText: string
	cursorBefore: { offset: number; line: number; column: number }
	cursorAfter: { offset: number; line: number; column: number }
	selectionBefore: SelectionRange | null
	selectionAfter: SelectionRange | null
	timestamp: number
	mergeMode?: HistoryMergeMode
}

export type HistoryState = {
	undoStack: HistoryEntry[]
	redoStack: HistoryEntry[]
}

// ---------------------------------------------------------------------------
// EditorCore API surface
// ---------------------------------------------------------------------------

export type EditorSnapshot = {
	identity: DocumentIdentity
	versions: VersionCounters
	document: DocumentModel
	cursor: CursorModel
	viewport: ViewportState
	history: HistoryState
	dirty: EditorDirtyState
}

export type DecorationSnapshot = {
	identity: DocumentIdentity
	docVersion: number
	syntax: unknown[]
	errors: unknown[]
	brackets?: unknown[]
	folds?: unknown[]
	/**
	 * Line IDs whose decorations changed. The view repaints just these rows.
	 * Omit to repaint every visible row.
	 */
	affectedLineIds?: number[]
}

export type EditorCore = {
	dispatch(tx: EditorTransaction): DispatchResult
	updateViewport(input: ViewportState): void
	applyDecorations(snapshot: DecorationSnapshot): void

	// Read API
	getSnapshot(): EditorSnapshot
	getLineCount(): number
	getLineId(index: number): number
	getLineIndex(lineId: number): number
	getLineRecord(index: number): LineRecord
	getLineRecordById(lineId: number): LineRecord
	getLineText(index: number): string
	getLineTextById(lineId: number): string
	getLineRevision(lineId: number): number
	getTextRange(start: number, end: number): string
	getSelections(): SelectionRange[]
	getCursor(): CursorModel
	getViewport(): ViewportState
	getDocumentLength(): number
	getDocumentIdentity(): DocumentIdentity
	getVersions(): VersionCounters

	// Subscription
	onDidChange(listener: (dirty: EditorDirtyState) => void): () => void
}

// ---------------------------------------------------------------------------
// EditorCore configuration
// ---------------------------------------------------------------------------

export type EditorCoreConfig = {
	/** Initial document to load. */
	document: EditorDocumentInput
	/** Tab size for column math. */
	tabSize?: number
	/** Cursor display mode. */
	cursorMode?: 'regular' | 'terminal'
	/** Maximum history entries before oldest is dropped. */
	maxHistoryEntries?: number
	/** Keystroke merge window for history coalescing (ms). */
	historyMergeWindowMs?: number
}

// ---------------------------------------------------------------------------
// FrameScheduler
// ---------------------------------------------------------------------------

export type FlushReason =
	| 'text'
	| 'gutter'
	| 'overlay'
	| 'viewport'
	| 'decorations'
	| 'fullMeasure'

export type FlushReceipt = {
	identity: DocumentIdentity
	docVersion: number
	rowsUpdated: number
	overlayUpdated: boolean
	gutterUpdated: boolean
	durationMicros: number
}

/**
 * Callback invoked by the scheduler on each RAF flush.
 * Receives the accumulated dirty state and returns a FlushReceipt.
 */
export type FlushTarget = (dirty: EditorDirtyState) => FlushReceipt

export type FrameScheduler = {
	/** Request a flush on the next animation frame. */
	requestFlush(reason: FlushReason): void
	/** Synchronously flush now (for testing or forced repaints). */
	flushNow(): FlushReceipt | null
	/** Subscribe to flush receipts. */
	onDidFlush(listener: (receipt: FlushReceipt) => void): () => void
	/** Tear down the scheduler (cancel pending RAF). */
	destroy(): void
}
