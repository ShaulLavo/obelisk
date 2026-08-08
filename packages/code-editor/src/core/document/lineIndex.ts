/**
 * Line index operations — framework-free.
 *
 * These are pure functions for building and maintaining the line starts
 * array, line IDs, and offset ↔ position conversions.
 *
 * Ported from editor/cursor/utils/lineStarts.ts and editor/cursor/utils/position.ts
 * to remove Solid dependency and serve as the authoritative implementation.
 */

import type { PieceTableSnapshot } from '@repo/utils'

// ---------------------------------------------------------------------------
// Build line starts
// ---------------------------------------------------------------------------

export const buildLineStartsFromText = (text: string): number[] => {
	const starts: number[] = [0]
	let index = text.indexOf('\n')
	while (index !== -1) {
		starts.push(index + 1)
		index = text.indexOf('\n', index + 1)
	}
	return starts
}

export const buildLineStartsFromSnapshot = (
	snapshot: PieceTableSnapshot
): number[] => {
	const starts: number[] = [0]
	if (snapshot.length === 0 || !snapshot.root) return starts

	type Node = NonNullable<typeof snapshot.root>
	const stack: Node[] = []
	let node: Node | null = snapshot.root
	let docOffset = 0

	while (node || stack.length > 0) {
		while (node) {
			stack.push(node)
			node = node.left
		}
		const current = stack.pop()
		if (!current) break

		const piece = current.piece
		const buffer =
			piece.buffer === 'original'
				? snapshot.buffers.original
				: snapshot.buffers.add
		const pieceStart = piece.start
		const pieceEnd = piece.start + piece.length

		let searchFrom = pieceStart
		while (searchFrom < pieceEnd) {
			const idx = buffer.indexOf('\n', searchFrom)
			if (idx === -1 || idx >= pieceEnd) break
			starts.push(docOffset + (idx - pieceStart) + 1)
			searchFrom = idx + 1
		}

		docOffset += piece.length
		node = current.right
	}

	return starts
}

// ---------------------------------------------------------------------------
// Edit line starts
// ---------------------------------------------------------------------------

export const insertSingleNewlineToLineStarts = (
	lineStarts: number[],
	startIndex: number
): number[] => {
	const len = lineStarts.length
	const newLineStart = startIndex + 1

	let lo = 0
	let hi = len
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (lineStarts[mid]! <= startIndex) {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	const insertAt = lo

	const result = new Array<number>(len + 1)
	for (let i = 0; i < insertAt; i++) {
		result[i] = lineStarts[i]!
	}
	result[insertAt] = newLineStart
	for (let i = insertAt; i < len; i++) {
		result[i + 1] = lineStarts[i]! + 1
	}
	return result
}

export const applyEditToLineStarts = (
	lineStarts: number[],
	startIndex: number,
	deletedText: string,
	insertedText: string,
	startLineHint?: number,
	endLineHint?: number
): number[] => {
	const len = lineStarts.length
	if (len === 0) return lineStarts

	if (
		startLineHint === undefined &&
		insertedText === '\n' &&
		deletedText.length === 0
	) {
		return insertSingleNewlineToLineStarts(lineStarts, startIndex)
	}

	const deletedLength = deletedText.length
	const insertedLength = insertedText.length
	const delta = insertedLength - deletedLength
	const oldEnd = startIndex + deletedLength

	let startLineIndex = 0
	if (startLineHint !== undefined) {
		startLineIndex = startLineHint
	} else {
		let low = 0
		let high = len - 1
		while (low <= high) {
			const mid = (low + high) >> 1
			if ((lineStarts[mid] ?? 0) <= startIndex) {
				startLineIndex = mid
				low = mid + 1
			} else {
				high = mid - 1
			}
		}
	}

	let firstAfterDeletion = len
	if (endLineHint !== undefined) {
		firstAfterDeletion = endLineHint + 1
	} else {
		let low = 0
		let high = len
		while (low < high) {
			const mid = (low + high) >> 1
			if ((lineStarts[mid] ?? 0) > oldEnd) {
				firstAfterDeletion = mid
				high = mid
			} else {
				low = mid + 1
			}
		}
	}

	let insertedNewlines = 0
	let searchPos = 0
	while ((searchPos = insertedText.indexOf('\n', searchPos)) !== -1) {
		insertedNewlines++
		searchPos++
	}

	const keepCount = startLineIndex + 1
	const tailCount = len - firstAfterDeletion
	const resultLen = keepCount + insertedNewlines + tailCount
	const result = new Array<number>(resultLen)

	for (let i = 0; i < keepCount; i++) {
		result[i] = lineStarts[i]!
	}

	let writeIdx = keepCount
	let nlIdx = insertedText.indexOf('\n')
	while (nlIdx !== -1) {
		result[writeIdx++] = startIndex + nlIdx + 1
		nlIdx = insertedText.indexOf('\n', nlIdx + 1)
	}

	for (let i = firstAfterDeletion; i < len; i++) {
		result[writeIdx++] = (lineStarts[i] ?? 0) + delta
	}

	return result
}

// ---------------------------------------------------------------------------
// Offset ↔ position conversions
// ---------------------------------------------------------------------------

export const offsetToLineIndex = (
	offset: number,
	lineStarts: number[],
	documentLength: number
): number => {
	if (lineStarts.length === 0) return 0

	const lastIndex = lineStarts.length - 1
	const safeDocLength = Math.max(0, documentLength)
	const lookupOffset = Math.min(Math.max(0, offset), safeDocLength)

	let low = 0
	let high = lastIndex
	let foundIndex = 0

	while (low <= high) {
		const mid = (low + high) >> 1
		const start = lineStarts[mid] ?? 0
		if (start <= lookupOffset) {
			foundIndex = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	return foundIndex
}

export const getLineStart = (
	lineIndex: number,
	lineStarts: number[]
): number => {
	if (lineStarts.length === 0) return 0
	const clamped = Math.max(0, Math.min(lineIndex, lineStarts.length - 1))
	return lineStarts[clamped] ?? 0
}

export const getLineTextLength = (
	lineIndex: number,
	lineStarts: number[],
	documentLength: number
): number => {
	if (lineStarts.length === 0) return 0
	const safeDocLength = Math.max(0, documentLength)
	const clampedLine = Math.max(0, Math.min(lineIndex, lineStarts.length - 1))
	const start = lineStarts[clampedLine] ?? 0
	const nextStart = lineStarts[clampedLine + 1] ?? safeDocLength
	if (clampedLine < lineStarts.length - 1) {
		return Math.max(0, nextStart - start - 1)
	}
	return Math.max(0, nextStart - start)
}

export const getLineLength = (
	lineIndex: number,
	lineStarts: number[],
	documentLength: number
): number => {
	if (lineStarts.length === 0) return 0
	const safeDocLength = Math.max(0, documentLength)
	const clampedLine = Math.max(0, Math.min(lineIndex, lineStarts.length - 1))
	const start = lineStarts[clampedLine] ?? 0
	const nextStart = lineStarts[clampedLine + 1] ?? safeDocLength
	return Math.max(0, nextStart - start)
}

export const offsetToPosition = (
	offset: number,
	lineStarts: number[],
	documentLength: number
): { offset: number; line: number; column: number } => {
	if (lineStarts.length === 0) {
		return { offset: 0, line: 0, column: 0 }
	}
	const safeDocLength = Math.max(0, documentLength)
	const lineIndex = offsetToLineIndex(offset, lineStarts, safeDocLength)
	const lineStart = lineStarts[lineIndex] ?? 0
	const lookupOffset = Math.min(Math.max(0, offset), safeDocLength)
	const relativeOffset = Math.max(0, lookupOffset - lineStart)
	const lineTextLen = getLineTextLength(lineIndex, lineStarts, safeDocLength)
	const column = Math.min(relativeOffset, lineTextLen)
	return { offset: lookupOffset, line: lineIndex, column }
}

export const positionToOffset = (
	line: number,
	column: number,
	lineStarts: number[],
	documentLength: number
): number => {
	if (lineStarts.length === 0) return 0
	const clampedLine = Math.max(0, Math.min(line, lineStarts.length - 1))
	const start = lineStarts[clampedLine] ?? 0
	const textLength = getLineTextLength(clampedLine, lineStarts, documentLength)
	const clampedColumn = Math.max(0, Math.min(column, textLength))
	const safeOffset = start + clampedColumn
	return Math.min(Math.max(0, safeOffset), Math.max(0, documentLength))
}

// ---------------------------------------------------------------------------
// Count newlines
// ---------------------------------------------------------------------------

export const countNewlines = (text: string): number => {
	let count = 0
	let pos = 0
	while ((pos = text.indexOf('\n', pos)) !== -1) {
		count++
		pos++
	}
	return count
}
