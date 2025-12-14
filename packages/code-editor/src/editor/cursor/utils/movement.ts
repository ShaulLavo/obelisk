import type { CursorPosition } from '../types'
import { createCursorPosition } from '../types'
import { getLineStart, getLineTextLength, offsetToPosition } from './position'

export const moveVertically = (
	position: CursorPosition,
	direction: 'up' | 'down',
	preferredColumn: number,
	lineStarts: number[],
	documentLength: number
): { position: CursorPosition; preferredColumn: number } => {
	if (lineStarts.length === 0) {
		return { position, preferredColumn }
	}

	const targetLine =
		direction === 'up'
			? Math.max(0, position.line - 1)
			: Math.min(lineStarts.length - 1, position.line + 1)

	if (targetLine === position.line) {
		return { position, preferredColumn }
	}

	const targetColumn = Math.min(
		preferredColumn,
		getLineTextLength(targetLine, lineStarts, documentLength)
	)
	const newOffset = getLineStart(targetLine, lineStarts) + targetColumn

	return {
		position: createCursorPosition(newOffset, targetLine, targetColumn),
		preferredColumn,
	}
}

export const moveByLines = (
	position: CursorPosition,
	delta: number,
	preferredColumn: number,
	lineStarts: number[],
	documentLength: number
): { position: CursorPosition; preferredColumn: number } => {
	if (lineStarts.length === 0 || delta === 0) {
		return { position, preferredColumn }
	}

	const targetLine = Math.max(
		0,
		Math.min(lineStarts.length - 1, position.line + delta)
	)

	if (targetLine === position.line) {
		return { position, preferredColumn }
	}

	const targetColumn = Math.min(
		preferredColumn,
		getLineTextLength(targetLine, lineStarts, documentLength)
	)
	const newOffset = getLineStart(targetLine, lineStarts) + targetColumn

	return {
		position: createCursorPosition(newOffset, targetLine, targetColumn),
		preferredColumn,
	}
}

export const moveToLineStart = (
	position: CursorPosition,
	lineStarts: number[]
): CursorPosition => {
	if (lineStarts.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const start = getLineStart(position.line, lineStarts)
	return createCursorPosition(start, position.line, 0)
}

export const moveToLineEnd = (
	position: CursorPosition,
	lineStarts: number[],
	documentLength: number
): CursorPosition => {
	if (lineStarts.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const endColumn = getLineTextLength(position.line, lineStarts, documentLength)
	const start = getLineStart(position.line, lineStarts)
	return createCursorPosition(start + endColumn, position.line, endColumn)
}

export const moveToDocStart = (): CursorPosition => {
	return createCursorPosition(0, 0, 0)
}

export const moveToDocEnd = (
	lineStarts: number[],
	documentLength: number
): CursorPosition => {
	if (lineStarts.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const lastLine = lineStarts.length - 1
	const endColumn = getLineTextLength(lastLine, lineStarts, documentLength)
	return createCursorPosition(
		getLineStart(lastLine, lineStarts) + endColumn,
		lastLine,
		endColumn
	)
}

export const moveCursorLeft = (
	position: CursorPosition,
	lineStarts: number[],
	documentLength: number
): CursorPosition => {
	if (position.offset <= 0) {
		return position
	}
	return offsetToPosition(position.offset - 1, lineStarts, documentLength)
}

export const moveCursorRight = (
	position: CursorPosition,
	documentLength: number,
	lineStarts: number[]
): CursorPosition => {
	if (position.offset >= documentLength) {
		return position
	}
	return offsetToPosition(position.offset + 1, lineStarts, documentLength)
}
