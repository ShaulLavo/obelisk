/**
 * HistoryModel — framework-free undo/redo with coalescing.
 *
 * Owns: undo/redo stacks, entry coalescing, merge window.
 * Does not own: document mutation (caller applies entries), DOM, Solid.
 */

import type {
	HistoryState,
	HistoryEntry,
	HistoryMergeMode,
	SelectionRange,
} from '../types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_HISTORY_ENTRIES = 200
export const DEFAULT_MERGE_WINDOW_MS = 200

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const createHistoryState = (): HistoryState => ({
	undoStack: [],
	redoStack: [],
})

// ---------------------------------------------------------------------------
// Entry creation
// ---------------------------------------------------------------------------

export type HistoryChangeInput = {
	offset: number
	insertedText: string
	deletedText: string
	cursorBefore: { offset: number; line: number; column: number }
	cursorAfter: { offset: number; line: number; column: number }
	selectionBefore: SelectionRange | null
	selectionAfter: SelectionRange | null
}

export const createHistoryEntry = (
	change: HistoryChangeInput,
	timestamp: number,
	mergeMode?: HistoryMergeMode
): HistoryEntry => ({
	offset: change.offset,
	insertedText: change.insertedText,
	deletedText: change.deletedText,
	cursorBefore: { ...change.cursorBefore },
	cursorAfter: { ...change.cursorAfter },
	selectionBefore: change.selectionBefore
		? { ...change.selectionBefore }
		: null,
	selectionAfter: change.selectionAfter
		? { ...change.selectionAfter }
		: null,
	timestamp,
	mergeMode,
})

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

const canMergeInsert = (
	prev: HistoryEntry,
	next: HistoryEntry,
	mergeWindowMs: number
): boolean => {
	if (prev.deletedText.length > 0 || next.deletedText.length > 0)
		return false
	if (next.offset !== prev.offset + prev.insertedText.length) return false
	return next.timestamp - prev.timestamp <= mergeWindowMs
}

const canMergeDelete = (
	prev: HistoryEntry,
	next: HistoryEntry,
	mergeWindowMs: number
): boolean => {
	if (prev.insertedText.length > 0 || next.insertedText.length > 0)
		return false
	const isBackspaceChain =
		next.offset + next.deletedText.length === prev.offset
	const isDeleteChain = next.offset === prev.offset
	return (
		next.timestamp - prev.timestamp <= mergeWindowMs &&
		(isBackspaceChain || isDeleteChain)
	)
}

export const mergeHistoryEntries = (
	prev: HistoryEntry,
	next: HistoryEntry,
	mergeWindowMs: number
): HistoryEntry | null => {
	if (!prev.mergeMode || prev.mergeMode !== next.mergeMode) return null

	if (
		prev.mergeMode === 'insert' &&
		canMergeInsert(prev, next, mergeWindowMs)
	) {
		return {
			...prev,
			insertedText: prev.insertedText + next.insertedText,
			cursorAfter: { ...next.cursorAfter },
			selectionAfter: next.selectionAfter
				? { ...next.selectionAfter }
				: null,
			timestamp: next.timestamp,
		}
	}

	if (
		prev.mergeMode === 'delete' &&
		canMergeDelete(prev, next, mergeWindowMs)
	) {
		const isBackspaceChain =
			next.offset + next.deletedText.length === prev.offset
		return {
			...prev,
			offset: isBackspaceChain ? next.offset : prev.offset,
			deletedText: isBackspaceChain
				? next.deletedText + prev.deletedText
				: prev.deletedText + next.deletedText,
			cursorAfter: { ...next.cursorAfter },
			selectionAfter: next.selectionAfter
				? { ...next.selectionAfter }
				: null,
			timestamp: next.timestamp,
		}
	}

	return null
}

// ---------------------------------------------------------------------------
// Record change
// ---------------------------------------------------------------------------

export const recordChange = (
	state: HistoryState,
	change: HistoryChangeInput,
	options: {
		mergeMode?: HistoryMergeMode
		maxEntries?: number
		mergeWindowMs?: number
	} = {}
): HistoryState => {
	const {
		mergeMode,
		maxEntries = DEFAULT_MAX_HISTORY_ENTRIES,
		mergeWindowMs = DEFAULT_MERGE_WINDOW_MS,
	} = options

	if (!change.insertedText && !change.deletedText) return state

	const entry = createHistoryEntry(change, Date.now(), mergeMode)
	const undoStack = state.undoStack.slice()

	const lastEntry = undoStack[undoStack.length - 1]
	if (lastEntry && entry.mergeMode && lastEntry.mergeMode === entry.mergeMode) {
		const merged = mergeHistoryEntries(lastEntry, entry, mergeWindowMs)
		if (merged) {
			undoStack[undoStack.length - 1] = merged
		} else {
			undoStack.push(entry)
		}
	} else {
		undoStack.push(entry)
	}

	if (undoStack.length > maxEntries) {
		undoStack.shift()
	}

	// Recording a new change clears the redo stack
	return { undoStack, redoStack: [] }
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

export type UndoRedoResult = {
	state: HistoryState
	entry: HistoryEntry
} | null

export const undo = (state: HistoryState): UndoRedoResult => {
	if (state.undoStack.length === 0) return null
	const entry = state.undoStack[state.undoStack.length - 1]!
	return {
		state: {
			undoStack: state.undoStack.slice(0, -1),
			redoStack: [...state.redoStack, entry],
		},
		entry,
	}
}

export const redo = (state: HistoryState): UndoRedoResult => {
	if (state.redoStack.length === 0) return null
	const entry = state.redoStack[state.redoStack.length - 1]!
	return {
		state: {
			undoStack: [...state.undoStack, entry],
			redoStack: state.redoStack.slice(0, -1),
		},
		entry,
	}
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const canUndo = (state: HistoryState): boolean =>
	state.undoStack.length > 0

export const canRedo = (state: HistoryState): boolean =>
	state.redoStack.length > 0
