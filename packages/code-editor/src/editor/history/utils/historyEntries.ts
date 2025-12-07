import type {
	HistoryChangeInput,
	HistoryEntry,
	HistoryMergeMode
} from '../types'
import { MERGE_WINDOW_MS } from '../constants'

const cloneCursorPosition = (
	position: HistoryEntry['cursorBefore']
): HistoryEntry['cursorBefore'] => ({
	offset: position.offset,
	line: position.line,
	column: position.column
})

const cloneSelection = (selection: HistoryEntry['selectionBefore']) =>
	selection ? { anchor: selection.anchor, focus: selection.focus } : null

const canMergeInsert = (prev: HistoryEntry, next: HistoryEntry) => {
	if (prev.deletedText.length > 0 || next.deletedText.length > 0) return false
	if (next.offset !== prev.offset + prev.insertedText.length) return false
	return next.timestamp - prev.timestamp <= MERGE_WINDOW_MS
}

const canMergeDelete = (prev: HistoryEntry, next: HistoryEntry) => {
	if (prev.insertedText.length > 0 || next.insertedText.length > 0) return false
	const isBackspaceChain =
		next.offset + next.deletedText.length === prev.offset
	const isDeleteChain = next.offset === prev.offset
	return (
		(next.timestamp - prev.timestamp <= MERGE_WINDOW_MS) &&
		(isBackspaceChain || isDeleteChain)
	)
}

export const createHistoryEntry = (
	change: HistoryChangeInput,
	timestamp: number,
	mergeMode?: HistoryMergeMode
): HistoryEntry => ({
	...change,
	cursorBefore: cloneCursorPosition(change.cursorBefore),
	cursorAfter: cloneCursorPosition(change.cursorAfter),
	selectionBefore: cloneSelection(change.selectionBefore),
	selectionAfter: cloneSelection(change.selectionAfter),
	timestamp,
	mergeMode
})

export const mergeHistoryEntries = (
	prev: HistoryEntry,
	next: HistoryEntry
): HistoryEntry | null => {
	if (!prev.mergeMode || prev.mergeMode !== next.mergeMode) {
		return null
	}

	if (prev.mergeMode === 'insert' && canMergeInsert(prev, next)) {
		return {
			...prev,
			insertedText: prev.insertedText + next.insertedText,
			cursorAfter: next.cursorAfter,
			selectionAfter: next.selectionAfter,
			timestamp: next.timestamp
		}
	}

	if (prev.mergeMode === 'delete' && canMergeDelete(prev, next)) {
		const isBackspaceChain =
			next.offset + next.deletedText.length === prev.offset

		return {
			...prev,
			offset: isBackspaceChain ? next.offset : prev.offset,
			deletedText: isBackspaceChain
				? next.deletedText + prev.deletedText
				: prev.deletedText + next.deletedText,
			cursorAfter: next.cursorAfter,
			selectionAfter: next.selectionAfter,
			timestamp: next.timestamp
		}
	}

	return null
}
