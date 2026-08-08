/**
 * Temporary Solid adapter for EditorCore.
 *
 * This adapter allows the current Solid runtime to read from EditorCore
 * without owning document state. It bridges EditorCore's imperative API
 * to the reactive CursorContextValue interface consumed by existing components.
 *
 * This adapter is transitional and will be deleted in Phase 8 when the
 * legacy pipeline is removed.
 */

import { createSignal, createMemo, type Accessor } from 'solid-js'
import type { PieceTableSnapshot } from '@repo/utils'
import type { EditorCore } from '../types'
import { offsetToPosition, positionToOffset } from '../document/lineIndex'

/**
 * Reactive signals that track EditorCore state for Solid consumers.
 *
 * The adapter subscribes to EditorCore.onDidChange and updates signals
 * so that existing Solid components (which depend on reactive reads)
 * continue to work without modification.
 */
export type SolidCoreAdapter = {
	/** Reactive line starts accessor. */
	lineStarts: Accessor<number[]>
	/** Reactive line IDs accessor. */
	lineIds: Accessor<number[]>
	/** Reactive line count accessor. */
	lineCount: Accessor<number>
	/** Reactive document length accessor. */
	documentLength: Accessor<number>
	/** Reactive piece table accessor. */
	pieceTable: Accessor<PieceTableSnapshot | undefined>
	/** Reactive revision counter (increments on any document change). */
	lineDataRevision: Accessor<number>

	// Passthrough read API (non-reactive, reads directly from core)
	getLineStart: (lineIndex: number) => number
	getLineLength: (lineIndex: number) => number
	getLineTextLength: (lineIndex: number) => number
	getLineText: (lineIndex: number) => string
	getLineId: (lineIndex: number) => number
	getLineIndex: (lineId: number) => number
	getLineTextById: (lineId: number) => string
	getLineLengthById: (lineId: number) => number
	getLineTextLengthById: (lineId: number) => number
	getLineStartById: (lineId: number) => number
	offsetToPosition: (offset: number) => { offset: number; line: number; column: number }
	positionToOffset: (line: number, column: number) => number
	getTextRange: (start: number, end: number) => string

	/** Dispose the adapter (unsubscribe from core). */
	dispose: () => void
}

export const createSolidCoreAdapter = (core: EditorCore): SolidCoreAdapter => {
	// Reactive signals that mirror core state
	const [lineStarts, setLineStarts] = createSignal<number[]>(
		core.getSnapshot().document.lineStarts
	)
	const [lineIds, setLineIds] = createSignal<number[]>(
		core.getSnapshot().document.lineIds
	)
	const [documentLength, setDocumentLength] = createSignal(
		core.getDocumentLength()
	)
	const [pieceTable, setPieceTable] = createSignal<PieceTableSnapshot | undefined>(
		core.getSnapshot().document.pieceTable
	)
	const [revision, setRevision] = createSignal(0)

	const lineCount = createMemo(() => lineStarts().length)

	// Subscribe to core changes
	const unsubscribe = core.onDidChange((dirty) => {
		if (dirty.text || dirty.gutter || dirty.fullMeasure) {
			const snapshot = core.getSnapshot()
			setLineStarts(snapshot.document.lineStarts)
			setLineIds(snapshot.document.lineIds)
			setDocumentLength(snapshot.document.length)
			setPieceTable(snapshot.document.pieceTable)
			setRevision((v) => v + 1)
		}
	})

	return {
		// Reactive accessors
		lineStarts,
		lineIds,
		lineCount,
		documentLength,
		pieceTable,
		lineDataRevision: revision,

		// Passthrough reads from core
		getLineStart: (lineIndex) => core.getLineRecord(lineIndex).start,
		getLineLength: (lineIndex) => core.getLineRecord(lineIndex).length,
		getLineTextLength: (lineIndex) => core.getLineRecord(lineIndex).textLength,
		getLineText: (lineIndex) => core.getLineText(lineIndex),
		getLineId: (lineIndex) => core.getLineId(lineIndex),
		getLineIndex: (lineId) => core.getLineIndex(lineId),
		getLineTextById: (lineId) => core.getLineTextById(lineId),
		getLineLengthById: (lineId) => core.getLineRecordById(lineId).length,
		getLineTextLengthById: (lineId) => core.getLineRecordById(lineId).textLength,
		getLineStartById: (lineId) => core.getLineRecordById(lineId).start,
		offsetToPosition: (offset) => {
			const snap = core.getSnapshot()
			return offsetToPosition(
				offset,
				snap.document.lineStarts,
				snap.document.length
			)
		},
		positionToOffset: (line, column) => {
			const snap = core.getSnapshot()
			return positionToOffset(
				line,
				column,
				snap.document.lineStarts,
				snap.document.length
			)
		},
		getTextRange: (start, end) => core.getTextRange(start, end),

		dispose: unsubscribe,
	}
}
