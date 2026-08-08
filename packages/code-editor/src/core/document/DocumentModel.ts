/**
 * DocumentModel — authoritative document state, framework-free.
 *
 * Owns: piece table, line starts, line IDs, line records, text access.
 * Does not own: selections, history, viewport, decorations, DOM.
 */

import {
	createPieceTableSnapshot,
	getPieceTableText,
	getPieceTableLength,
	insertIntoPieceTable,
	deleteFromPieceTable,
	type PieceTableSnapshot,
} from '@repo/utils'
import type { DocumentModel, LineRecord, EditorDocumentInput } from '../types'
import {
	buildLineStartsFromText,
	buildLineStartsFromSnapshot,
	applyEditToLineStarts,
	offsetToLineIndex,
	getLineStart,
	getLineTextLength,
	getLineLength,
	countNewlines,
} from './lineIndex'
import {
	createLineIdAllocator,
	buildLineIndexById,
	computeLineIdsForEdit,
	type LineIdAllocator,
} from './lineIds'

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createDocumentModel = (
	input: EditorDocumentInput
): { model: DocumentModel; allocator: LineIdAllocator } => {
	const pieceTable =
		input.pieceTable ?? createPieceTableSnapshot(input.content)
	const length = getPieceTableLength(pieceTable)
	const lineStarts = buildLineStartsFromSnapshot(pieceTable)
	const allocator = createLineIdAllocator(1)
	const lineIds = allocator.allocate(lineStarts.length)
	const lineIndexById = buildLineIndexById(lineIds)
	const lineRecordsById = buildLineRecords(
		pieceTable,
		lineStarts,
		lineIds,
		length
	)

	return {
		model: {
			pieceTable,
			length,
			lineStarts,
			lineIds,
			lineIndexById,
			lineRecordsById,
			nextLineId: allocator.peek(),
		},
		allocator,
	}
}

// ---------------------------------------------------------------------------
// Line records
// ---------------------------------------------------------------------------

const buildLineRecords = (
	pieceTable: PieceTableSnapshot,
	lineStarts: number[],
	lineIds: number[],
	docLength: number
): Map<number, LineRecord> => {
	const records = new Map<number, LineRecord>()
	const lineCount = Math.min(lineIds.length, lineStarts.length)
	for (let i = 0; i < lineCount; i++) {
		const id = lineIds[i]!
		const start = lineStarts[i] ?? 0
		const nextStart = lineStarts[i + 1] ?? docLength
		const length = Math.max(0, nextStart - start)
		const textLength =
			i < lineCount - 1 ? Math.max(0, length - 1) : length
		records.set(id, { id, start, length, textLength, revision: 1 })
	}
	return records
}

// ---------------------------------------------------------------------------
// Text access
// ---------------------------------------------------------------------------

export const getDocumentText = (
	model: DocumentModel,
	start: number,
	end: number
): string => {
	const safeStart = Math.max(0, Math.min(start, model.length))
	const safeEnd = Math.max(safeStart, Math.min(end, model.length))
	return getPieceTableText(model.pieceTable, safeStart, safeEnd)
}

export const getDocumentLineText = (
	model: DocumentModel,
	lineIndex: number
): string => {
	const clamped = Math.max(
		0,
		Math.min(lineIndex, model.lineStarts.length - 1)
	)
	const start = getLineStart(clamped, model.lineStarts)
	const textLen = getLineTextLength(clamped, model.lineStarts, model.length)
	return getPieceTableText(model.pieceTable, start, start + textLen)
}

export const getDocumentLineTextById = (
	model: DocumentModel,
	lineId: number
): string => {
	const index = model.lineIndexById.get(lineId)
	if (index === undefined) return ''
	return getDocumentLineText(model, index)
}

// ---------------------------------------------------------------------------
// Edit operations
// ---------------------------------------------------------------------------

export type DocumentEditResult = {
	model: DocumentModel
	startLine: number
	endLine: number
	lineDelta: number
}

/**
 * Apply a single edit (insert/delete/replace) to the document.
 * Returns the new model and affected line range.
 */
export const applyDocumentEdit = (
	model: DocumentModel,
	startOffset: number,
	deletedLength: number,
	insertedText: string,
	allocator: LineIdAllocator
): DocumentEditResult => {
	const safeStart = Math.max(0, Math.min(startOffset, model.length))
	const safeDeleteEnd = Math.min(safeStart + deletedLength, model.length)
	const actualDeleteLen = safeDeleteEnd - safeStart

	// Get deleted text for line-start computation
	const deletedText =
		actualDeleteLen > 0
			? getPieceTableText(model.pieceTable, safeStart, safeDeleteEnd)
			: ''

	// Mutate piece table
	let pt = model.pieceTable
	if (actualDeleteLen > 0) {
		pt = deleteFromPieceTable(pt, safeStart, actualDeleteLen)
	}
	if (insertedText.length > 0) {
		pt = insertIntoPieceTable(pt, safeStart, insertedText)
	}

	const newLength = getPieceTableLength(pt)

	// Compute line changes
	const deletedNewlines = countNewlines(deletedText)
	const insertedNewlines = countNewlines(insertedText)
	const lineDelta = insertedNewlines - deletedNewlines

	const startLine = offsetToLineIndex(
		safeStart,
		model.lineStarts,
		model.length
	)
	const endOffset = Math.min(model.length, safeStart + actualDeleteLen)
	const endLine = offsetToLineIndex(
		endOffset,
		model.lineStarts,
		model.length
	)

	// Update line starts
	const newLineStarts = applyEditToLineStarts(
		model.lineStarts,
		safeStart,
		deletedText,
		insertedText,
		startLine,
		endLine
	)

	// Update line IDs
	let newLineIds: number[]
	if (lineDelta === 0) {
		newLineIds = model.lineIds.slice()
	} else {
		newLineIds = computeLineIdsForEdit(
			model.lineIds,
			startLine,
			endLine,
			lineDelta,
			allocator
		)
	}

	// Rebuild index and records
	const newLineIndexById = buildLineIndexById(newLineIds)
	const newRecords = new Map<number, LineRecord>()
	const lineCount = Math.min(newLineIds.length, newLineStarts.length)

	for (let i = 0; i < lineCount; i++) {
		const id = newLineIds[i]!
		const start = newLineStarts[i] ?? 0
		const nextStart = newLineStarts[i + 1] ?? newLength
		const length = Math.max(0, nextStart - start)
		const textLength = i < lineCount - 1 ? Math.max(0, length - 1) : length

		// Preserve revision for unchanged lines, bump for affected lines
		const oldRecord = model.lineRecordsById.get(id)
		const isAffected =
			i >= startLine && i <= startLine + Math.max(0, lineDelta) + (endLine - startLine)
		const revision =
			oldRecord && !isAffected ? oldRecord.revision : (oldRecord?.revision ?? 0) + 1

		newRecords.set(id, { id, start, length, textLength, revision })
	}

	return {
		model: {
			pieceTable: pt,
			length: newLength,
			lineStarts: newLineStarts,
			lineIds: newLineIds,
			lineIndexById: newLineIndexById,
			lineRecordsById: newRecords,
			nextLineId: allocator.peek(),
		},
		startLine,
		endLine,
		lineDelta,
	}
}

/**
 * Apply multiple edits atomically. Edits must be sorted by offset ascending.
 * Each edit's offsets are in the original document coordinate space.
 */
export const applyDocumentEdits = (
	model: DocumentModel,
	edits: Array<{ start: number; end: number; text: string }>,
	allocator: LineIdAllocator
): DocumentEditResult => {
	if (edits.length === 0) {
		return { model, startLine: 0, endLine: 0, lineDelta: 0 }
	}

	// Apply edits in reverse order so offsets remain valid
	const sorted = [...edits].sort((a, b) => b.start - a.start)

	let current = model
	let overallStartLine = Infinity
	let overallEndLine = 0
	let totalLineDelta = 0

	for (const edit of sorted) {
		const deleteLen = Math.max(0, edit.end - edit.start)
		const deletedText =
			deleteLen > 0
				? getPieceTableText(current.pieceTable, edit.start, edit.end)
				: ''
		const result = applyDocumentEdit(
			current,
			edit.start,
			deleteLen,
			edit.text,
			allocator
		)
		current = result.model
		overallStartLine = Math.min(overallStartLine, result.startLine)
		overallEndLine = Math.max(overallEndLine, result.endLine)
		totalLineDelta += result.lineDelta
	}

	if (overallStartLine === Infinity) overallStartLine = 0

	return {
		model: current,
		startLine: overallStartLine,
		endLine: overallEndLine,
		lineDelta: totalLineDelta,
	}
}

/**
 * Replace the entire document content. All line IDs are rebuilt.
 */
export const replaceDocument = (
	input: EditorDocumentInput,
	allocator: LineIdAllocator
): DocumentModel => {
	const pieceTable =
		input.pieceTable ?? createPieceTableSnapshot(input.content)
	const length = getPieceTableLength(pieceTable)
	const lineStarts = buildLineStartsFromSnapshot(pieceTable)
	const lineIds = allocator.allocate(lineStarts.length)
	const lineIndexById = buildLineIndexById(lineIds)
	const lineRecordsById = buildLineRecords(
		pieceTable,
		lineStarts,
		lineIds,
		length
	)

	return {
		pieceTable,
		length,
		lineStarts,
		lineIds,
		lineIndexById,
		lineRecordsById,
		nextLineId: allocator.peek(),
	}
}

/**
 * Replace document content while preserving identity.
 */
export const replaceContent = (
	model: DocumentModel,
	content: string,
	allocator: LineIdAllocator
): DocumentModel => {
	const pieceTable = createPieceTableSnapshot(content)
	const length = content.length
	const lineStarts = buildLineStartsFromText(content)
	const lineIds = allocator.allocate(lineStarts.length)
	const lineIndexById = buildLineIndexById(lineIds)
	const lineRecordsById = buildLineRecords(
		pieceTable,
		lineStarts,
		lineIds,
		length
	)

	return {
		pieceTable,
		length,
		lineStarts,
		lineIds,
		lineIndexById,
		lineRecordsById,
		nextLineId: allocator.peek(),
	}
}
