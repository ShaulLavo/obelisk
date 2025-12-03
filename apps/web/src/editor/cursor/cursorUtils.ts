import type { LineEntry } from '../types'
import type { CursorPosition, CursorNavigationContext } from './types'
import { createCursorPosition } from './types'

/**
 * Convert an absolute offset to a line/column position
 */
export const offsetToPosition = (
	offset: number,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (lineEntries.length === 0) {
		return createCursorPosition(0, 0, 0)
	}

	// Clamp offset to valid range
	const clampedOffset = Math.max(0, offset)

	for (let i = 0; i < lineEntries.length; i++) {
		const entry = lineEntries[i]!
		const lineEnd = entry.start + entry.length

		// Check if offset falls within this line (including the newline if present)
		if (clampedOffset < lineEnd || i === lineEntries.length - 1) {
			const column = Math.min(clampedOffset - entry.start, entry.text.length)
			return createCursorPosition(
				clampedOffset,
				entry.index,
				Math.max(0, column)
			)
		}
	}

	// Fallback: position at end of last line
	const lastEntry = lineEntries[lineEntries.length - 1]!
	return createCursorPosition(
		lastEntry.start + lastEntry.text.length,
		lastEntry.index,
		lastEntry.text.length
	)
}

/**
 * Convert a line/column position to an absolute offset
 */
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

/**
 * Move cursor vertically (ArrowUp/ArrowDown) while preserving preferred column
 */
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

	// If we can't move (at top/bottom), return unchanged
	if (targetLine === position.line) {
		return { position, preferredColumn }
	}

	const targetEntry = lineEntries[targetLine]!
	// Use preferredColumn to determine actual column (clamped to line length)
	const targetColumn = Math.min(preferredColumn, targetEntry.text.length)
	const newOffset = targetEntry.start + targetColumn

	return {
		position: createCursorPosition(newOffset, targetLine, targetColumn),
		preferredColumn // Keep the same preferred column
	}
}

/**
 * Move cursor by multiple lines at once (for PageUp/PageDown)
 * Positive delta moves down, negative moves up
 */
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

	// If we can't move (at top/bottom), return unchanged
	if (targetLine === position.line) {
		return { position, preferredColumn }
	}

	const targetEntry = lineEntries[targetLine]!
	// Use preferredColumn to determine actual column (clamped to line length)
	const targetColumn = Math.min(preferredColumn, targetEntry.text.length)
	const newOffset = targetEntry.start + targetColumn

	return {
		position: createCursorPosition(newOffset, targetLine, targetColumn),
		preferredColumn // Keep the same preferred column
	}
}

/**
 * Move cursor to the start of the current line
 */
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

/**
 * Move cursor to the end of the current line
 */
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

/**
 * Move cursor to the start of the document
 */
export const moveToDocStart = (): CursorPosition => {
	return createCursorPosition(0, 0, 0)
}

/**
 * Move cursor to the end of the document
 */
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

/**
 * Check if a character is a word character (alphanumeric or underscore)
 */
const isWordChar = (char: string): boolean => {
	return /[\w]/.test(char)
}

/**
 * Find the next word boundary moving left
 */
export const findWordBoundaryLeft = (text: string, offset: number): number => {
	if (offset <= 0) return 0

	let pos = offset - 1

	// Skip any whitespace
	while (pos > 0 && /\s/.test(text[pos]!)) {
		pos--
	}

	// If we're on a word char, skip to start of word
	if (pos >= 0 && isWordChar(text[pos]!)) {
		while (pos > 0 && isWordChar(text[pos - 1]!)) {
			pos--
		}
	} else if (pos >= 0) {
		// We're on a non-word, non-space char - skip similar chars
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

/**
 * Find the next word boundary moving right
 */
export const findWordBoundaryRight = (text: string, offset: number): number => {
	if (offset >= text.length) return text.length

	let pos = offset

	// If on word char, skip to end of word
	if (isWordChar(text[pos]!)) {
		while (pos < text.length && isWordChar(text[pos]!)) {
			pos++
		}
	} else if (!/\s/.test(text[pos]!)) {
		// On non-word, non-space - skip similar
		while (
			pos < text.length &&
			!isWordChar(text[pos]!) &&
			!/\s/.test(text[pos]!)
		) {
			pos++
		}
	}

	// Skip whitespace after
	while (pos < text.length && /\s/.test(text[pos]!)) {
		pos++
	}

	return pos
}

/**
 * Move cursor by word in the given direction
 */
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

/**
 * Move cursor left by one character
 */
export const moveCursorLeft = (
	position: CursorPosition,
	lineEntries: LineEntry[]
): CursorPosition => {
	if (position.offset <= 0) {
		return position
	}
	return offsetToPosition(position.offset - 1, lineEntries)
}

/**
 * Move cursor right by one character
 */
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

/**
 * Calculate the pixel X position for a cursor at a given column
 * Uses estimated character width (monospace assumption)
 */
export const calculateCursorX = (
	column: number,
	fontSize: number,
	charWidthRatio: number
): number => {
	return column * fontSize * charWidthRatio
}

/**
 * Calculate the column from a click X position
 * Uses estimated character width (monospace assumption)
 */
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
