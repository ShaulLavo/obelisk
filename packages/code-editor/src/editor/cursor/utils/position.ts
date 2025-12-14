import type { CursorPosition } from '../types'
import { createCursorPosition } from '../types'

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

export const getLineStart = (
	lineIndex: number,
	lineStarts: number[]
): number => {
	if (lineStarts.length === 0) return 0
	const clamped = Math.max(0, Math.min(lineIndex, lineStarts.length - 1))
	return lineStarts[clamped] ?? 0
}

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

export const offsetToPosition = (
	offset: number,
	lineStarts: number[],
	documentLength: number
): CursorPosition => {
	if (lineStarts.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const safeDocLength = Math.max(0, documentLength)
	const lineIndex = offsetToLineIndex(offset, lineStarts, safeDocLength)
	const lineStart = lineStarts[lineIndex] ?? 0
	const lookupOffset = Math.min(Math.max(0, offset), safeDocLength)
	const relativeOffset = Math.max(0, lookupOffset - lineStart)
	const lineTextLength = getLineTextLength(lineIndex, lineStarts, safeDocLength)
	const column = Math.min(relativeOffset, lineTextLength)

	return createCursorPosition(lookupOffset, lineIndex, column)
}

export const positionToOffset = (
	line: number,
	column: number,
	lineStarts: number[],
	documentLength: number
): number => {
	if (lineStarts.length === 0) {
		return 0
	}

	const clampedLine = Math.max(0, Math.min(line, lineStarts.length - 1))
	const start = lineStarts[clampedLine] ?? 0
	const textLength = getLineTextLength(clampedLine, lineStarts, documentLength)
	const clampedColumn = Math.max(0, Math.min(column, textLength))

	const safeOffset = start + clampedColumn
	return Math.min(Math.max(0, safeOffset), Math.max(0, documentLength))
}
