import type { LineEntry } from '../../types'
import type { CursorPosition } from '../types'
import { createCursorPosition } from '../types'
import { offsetToPosition } from './position'

export const moveVertically = (
	position: CursorPosition,
	direction: 'up' | 'down',
	preferredColumn: number,
	lineEntries: LineEntry[]
): { position: CursorPosition; preferredColumn: number } => {
	if (lineEntries.length === 0) {
		return { position, preferredColumn }
	}

	const targetLine =
		direction === 'up'
			? Math.max(0, position.line - 1)
			: Math.min(lineEntries.length - 1, position.line + 1)

	if (targetLine === position.line) {
		return { position, preferredColumn }
	}

	const targetEntry = lineEntries[targetLine]!
	const targetColumn = Math.min(preferredColumn, targetEntry.text.length)
	const newOffset = targetEntry.start + targetColumn

	return {
		position: createCursorPosition(newOffset, targetLine, targetColumn),
		preferredColumn
	}
}

export const moveByLines = (
	position: CursorPosition,
	delta: number,
	preferredColumn: number,
	lineEntries: LineEntry[]
): { position: CursorPosition; preferredColumn: number } => {
	if (lineEntries.length === 0 || delta === 0) {
		return { position, preferredColumn }
	}

	const targetLine = Math.max(
		0,
		Math.min(lineEntries.length - 1, position.line + delta)
	)

	if (targetLine === position.line) {
		return { position, preferredColumn }
	}

	const targetEntry = lineEntries[targetLine]!
	const targetColumn = Math.min(preferredColumn, targetEntry.text.length)
	const newOffset = targetEntry.start + targetColumn

	return {
		position: createCursorPosition(newOffset, targetLine, targetColumn),
		preferredColumn
	}
}

export const moveToLineStart = (
	position: CursorPosition,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (lineEntries.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const entry = lineEntries[position.line]
	if (!entry) {
		return position
	}

	return createCursorPosition(entry.start, position.line, 0)
}

export const moveToLineEnd = (
	position: CursorPosition,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (lineEntries.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const entry = lineEntries[position.line]
	if (!entry) {
		return position
	}

	const endColumn = entry.text.length
	return createCursorPosition(entry.start + endColumn, position.line, endColumn)
}

export const moveToDocStart = (): CursorPosition => {
	return createCursorPosition(0, 0, 0)
}

export const moveToDocEnd = (lineEntries: LineEntry[]): CursorPosition => {
	if (lineEntries.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const lastEntry = lineEntries[lineEntries.length - 1]!
	const endColumn = lastEntry.text.length
	return createCursorPosition(
		lastEntry.start + endColumn,
		lastEntry.index,
		endColumn
	)
}

export const moveCursorLeft = (
	position: CursorPosition,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (position.offset <= 0) {
		return position
	}
	return offsetToPosition(position.offset - 1, lineEntries)
}

export const moveCursorRight = (
	position: CursorPosition,
	documentLength: number,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (position.offset >= documentLength) {
		return position
	}
	return offsetToPosition(position.offset + 1, lineEntries)
}
