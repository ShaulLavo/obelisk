import type { LineEntry } from '../../types'
import type { CursorPosition } from '../types'
import { createCursorPosition } from '../types'

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
	let foundEntryIndex = 0

	while (low <= high) {
		const mid = (low + high) >> 1
		const entry = lineEntries[mid]!

		if (entry.start <= lookupOffset) {
			foundEntryIndex = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	const entry = lineEntries[foundEntryIndex]!
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
