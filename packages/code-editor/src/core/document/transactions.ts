/**
 * Document transaction helpers — pure functions for computing edit parameters
 * from high-level transaction types.
 *
 * These bridge the gap between EditorTransaction commands and the raw
 * (startOffset, deletedLength, insertedText) that DocumentModel.applyDocumentEdit expects.
 */

import type { DocumentModel, SelectionRange, AtomicEdit } from '../types'
import { getDocumentText } from './DocumentModel'
import { offsetToLineIndex, getLineStart, getLineTextLength } from './lineIndex'

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

export const getSelectionBounds = (
	sel: SelectionRange
): { start: number; end: number } => ({
	start: Math.min(sel.anchor, sel.focus),
	end: Math.max(sel.anchor, sel.focus),
})

export const hasSelection = (sel: SelectionRange): boolean =>
	sel.anchor !== sel.focus

// ---------------------------------------------------------------------------
// Delete backward/forward computation
// ---------------------------------------------------------------------------

export type EditParams = {
	startOffset: number
	deletedLength: number
	insertedText: string
}

/**
 * Compute edit params for delete-backward at the current selection.
 * If there's a selection, deletes the selection. Otherwise deletes one char backward.
 */
export const computeDeleteBackward = (
	doc: DocumentModel,
	sel: SelectionRange,
	byWord: boolean
): EditParams | null => {
	if (hasSelection(sel)) {
		const bounds = getSelectionBounds(sel)
		return {
			startOffset: bounds.start,
			deletedLength: bounds.end - bounds.start,
			insertedText: '',
		}
	}

	const offset = sel.focus
	if (offset <= 0) return null

	if (byWord) {
		const deleteStart = findWordBoundaryLeft(doc, offset)
		return {
			startOffset: deleteStart,
			deletedLength: offset - deleteStart,
			insertedText: '',
		}
	}

	return {
		startOffset: offset - 1,
		deletedLength: 1,
		insertedText: '',
	}
}

/**
 * Compute edit params for delete-forward at the current selection.
 */
export const computeDeleteForward = (
	doc: DocumentModel,
	sel: SelectionRange,
	byWord: boolean
): EditParams | null => {
	if (hasSelection(sel)) {
		const bounds = getSelectionBounds(sel)
		return {
			startOffset: bounds.start,
			deletedLength: bounds.end - bounds.start,
			insertedText: '',
		}
	}

	const offset = sel.focus
	if (offset >= doc.length) return null

	if (byWord) {
		const deleteEnd = findWordBoundaryRight(doc, offset)
		return {
			startOffset: offset,
			deletedLength: deleteEnd - offset,
			insertedText: '',
		}
	}

	return {
		startOffset: offset,
		deletedLength: 1,
		insertedText: '',
	}
}

/**
 * Compute edit params for inserting text at the current selection.
 * If there's a selection, it is replaced.
 */
export const computeInsertText = (
	sel: SelectionRange,
	text: string
): EditParams => {
	if (hasSelection(sel)) {
		const bounds = getSelectionBounds(sel)
		return {
			startOffset: bounds.start,
			deletedLength: bounds.end - bounds.start,
			insertedText: text,
		}
	}

	return {
		startOffset: sel.focus,
		deletedLength: 0,
		insertedText: text,
	}
}

/**
 * Compute edit params for replace-range.
 */
export const computeReplaceRange = (
	start: number,
	end: number,
	text: string
): EditParams => ({
	startOffset: Math.max(0, start),
	deletedLength: Math.max(0, end - start),
	insertedText: text,
})

/**
 * Validate and normalize atomic edits for apply-edits.
 * Returns edits sorted by start offset ascending.
 */
export const normalizeAtomicEdits = (
	edits: AtomicEdit[],
	docLength: number
): AtomicEdit[] => {
	return edits
		.map((edit) => ({
			start: Math.max(0, Math.min(edit.start, docLength)),
			end: Math.max(edit.start, Math.min(edit.end, docLength)),
			text: edit.text,
		}))
		.sort((a, b) => a.start - b.start)
}

// ---------------------------------------------------------------------------
// Word boundary detection
// ---------------------------------------------------------------------------

const isWordChar = (ch: string): boolean => /[\w]/.test(ch)

const findWordBoundaryLeft = (doc: DocumentModel, offset: number): number => {
	if (offset <= 0) return 0
	const lineIdx = offsetToLineIndex(offset, doc.lineStarts, doc.length)
	const lineStart = getLineStart(lineIdx, doc.lineStarts)

	// Don't cross line boundaries for word delete
	if (offset <= lineStart) return Math.max(0, offset - 1)

	const lineTextLen = getLineTextLength(lineIdx, doc.lineStarts, doc.length)
	const text = getDocumentText(doc, lineStart, lineStart + lineTextLen)
	let col = offset - lineStart

	// Skip whitespace
	while (col > 0 && !isWordChar(text[col - 1] ?? '')) col--
	// Skip word chars
	while (col > 0 && isWordChar(text[col - 1] ?? '')) col--

	return lineStart + col
}

const findWordBoundaryRight = (doc: DocumentModel, offset: number): number => {
	if (offset >= doc.length) return doc.length
	const lineIdx = offsetToLineIndex(offset, doc.lineStarts, doc.length)
	const lineStart = getLineStart(lineIdx, doc.lineStarts)
	const lineTextLen = getLineTextLength(lineIdx, doc.lineStarts, doc.length)
	const lineEnd = lineStart + lineTextLen

	if (offset >= lineEnd) return Math.min(doc.length, offset + 1)

	const text = getDocumentText(doc, lineStart, lineEnd)
	let col = offset - lineStart

	// Skip word chars
	while (col < text.length && isWordChar(text[col] ?? '')) col++
	// Skip whitespace
	while (col < text.length && !isWordChar(text[col] ?? '')) col++

	return lineStart + col
}
