import type { LineEntry } from '../types'
import type { CursorPosition } from './types'
import { createCursorPosition } from './types'

export const offsetToPosition = (
	offset: number,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (lineEntries.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	const lastEntryIndex = lineEntries.length - 1
	const lastEntry = lineEntries[lastEntryIndex]!
	const documentEnd = lastEntry.start + lastEntry.length

	const positiveOffset = Math.max(0, offset)
	const lookupOffset = Math.min(positiveOffset, documentEnd)

	let low = 0
	let high = lastEntryIndex
	let lineIndex = 0

	while (low <= high) {
		const mid = (low + high) >> 1
		const entry = lineEntries[mid]!

		if (entry.start <= lookupOffset) {
			lineIndex = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	const entry = lineEntries[lineIndex]!
	const relativeOffset = Math.max(0, lookupOffset - entry.start)
	const column = Math.min(relativeOffset, entry.text.length)

	return createCursorPosition(lookupOffset, entry.index, column)
}

export const positionToOffset = (
	line: number,
	column: number,
	lineEntries: LineEntry[]
): number => {
	if (lineEntries.length === 0) {
		return 0
	}

	const clampedLine = Math.max(0, Math.min(line, lineEntries.length - 1))
	const entry = lineEntries[clampedLine]!
	const clampedColumn = Math.max(0, Math.min(column, entry.text.length))

	return entry.start + clampedColumn
}

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

const isWordChar = (char: string): boolean => {
	return /[\w]/.test(char)
}

export const findWordBoundaryLeft = (text: string, offset: number): number => {
	if (offset <= 0) return 0

	let pos = offset - 1

	while (pos > 0 && /\s/.test(text[pos]!)) {
		pos--
	}

	if (pos >= 0 && isWordChar(text[pos]!)) {
		while (pos > 0 && isWordChar(text[pos - 1]!)) {
			pos--
		}
	} else if (pos >= 0) {
		const currentChar = text[pos]!
		while (
			pos > 0 &&
			!isWordChar(text[pos - 1]!) &&
			!/\s/.test(text[pos - 1]!)
		) {
			pos--
		}
	}

	return pos
}

export const findWordBoundaryRight = (text: string, offset: number): number => {
	if (offset >= text.length) return text.length

	let pos = offset

	if (isWordChar(text[pos]!)) {
		while (pos < text.length && isWordChar(text[pos]!)) {
			pos++
		}
	} else if (!/\s/.test(text[pos]!)) {
		while (
			pos < text.length &&
			!isWordChar(text[pos]!) &&
			!/\s/.test(text[pos]!)
		) {
			pos++
		}
	}

	while (pos < text.length && /\s/.test(text[pos]!)) {
		pos++
	}

	return pos
}

export const moveByWord = (
	position: CursorPosition,
	direction: 'left' | 'right',
	text: string,
	lineEntries: LineEntry[]
): CursorPosition => {
	const newOffset =
		direction === 'left'
			? findWordBoundaryLeft(text, position.offset)
			: findWordBoundaryRight(text, position.offset)

	return offsetToPosition(newOffset, lineEntries)
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

export const calculateCursorX = (
	column: number,
	fontSize: number,
	charWidthRatio: number
): number => {
	return column * fontSize * charWidthRatio
}

export const calculateColumnFromX = (
	x: number,
	fontSize: number,
	charWidthRatio: number,
	maxColumn: number
): number => {
	const charWidth = fontSize * charWidthRatio
	const column = Math.round(x / charWidth)
	return Math.max(0, Math.min(column, maxColumn))
}
