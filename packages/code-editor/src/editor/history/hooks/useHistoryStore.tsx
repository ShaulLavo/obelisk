import { createMemo } from 'solid-js'
import { ReactiveMap } from '@solid-primitives/map'
import { loggers } from '@repo/logger'
import {
	createPieceTableSnapshot,
	deleteFromPieceTable,
	insertIntoPieceTable,
} from '@repo/utils'
import { useCursor } from '../../cursor'
import type { TextEditorDocument } from '../../types'
import type {
	HistoryChangeInput,
	HistoryContextValue,
	HistoryEntry,
	HistoryMergeMode,
	HistoryState,
} from '../types'
import { MAX_HISTORY_ENTRIES } from '../constants'
import { createEmptyHistoryState } from '../utils/historyState'
import {
	createHistoryEntry,
	mergeHistoryEntries,
} from '../utils/historyEntries'
import { describeIncrementalEdit } from '../../utils'

const historyLogger = loggers.codeEditor.withTag('history')

const historyStore = new ReactiveMap<string, HistoryState>()

const summarizeEntry = (entry: HistoryEntry) => ({
	offset: entry.offset,
	insertedLength: entry.insertedText.length,
	deletedLength: entry.deletedText.length,
	mergeMode: entry.mergeMode,
})

export const useHistoryStore = (
	document: TextEditorDocument
): HistoryContextValue => {
	const cursor = useCursor()

	const filePath = createMemo(() => document.filePath())

	const setHistoryState = (path: string, next: HistoryState) => {
		historyStore.set(path, next)
		historyLogger.debug('updated history state', {
			path,
			undoDepth: next.undoStack.length,
			redoDepth: next.redoStack.length,
		})
	}

	const getHistoryState = (path: string): HistoryState => {
		const existing = historyStore.get(path)
		if (existing) return existing
		const initial = createEmptyHistoryState()
		setHistoryState(path, initial)
		historyLogger.debug('created empty history state', { path })
		return initial
	}

	const applyCursorSnapshot = (
		position: HistoryEntry['cursorBefore'],
		selection: HistoryEntry['selectionBefore']
	) => {
		if (selection) {
			cursor.actions.setSelection(selection.anchor, selection.focus)
			return
		}

		cursor.actions.setCursor(position)
	}

	const applyHistoryEntry = (
		entry: HistoryEntry,
		direction: 'undo' | 'redo'
	) => {
		const deletedTextForTree =
			direction === 'undo' ? entry.insertedText : entry.deletedText
		const insertedTextForTree =
			direction === 'undo' ? entry.deletedText : entry.insertedText
		const incrementalEdit =
			document.applyIncrementalEdit &&
			describeIncrementalEdit(
				(offset) => {
					const position = cursor.lines.offsetToPosition(offset)
					return { row: position.line, column: position.column }
				},
				entry.offset,
				deletedTextForTree,
				insertedTextForTree
			)

		document.updatePieceTable((current) => {
			const baseSnapshot =
				current ??
				createPieceTableSnapshot(cursor.getTextRange(0, cursor.documentLength()))
			let snapshot = baseSnapshot

			if (direction === 'undo') {
				if (entry.insertedText.length > 0) {
					snapshot = deleteFromPieceTable(
						snapshot,
						entry.offset,
						entry.insertedText.length
					)
				}
				if (entry.deletedText.length > 0) {
					snapshot = insertIntoPieceTable(
						snapshot,
						entry.offset,
						entry.deletedText
					)
				}
			} else {
				if (entry.deletedText.length > 0) {
					snapshot = deleteFromPieceTable(
						snapshot,
						entry.offset,
						entry.deletedText.length
					)
				}
				if (entry.insertedText.length > 0) {
					snapshot = insertIntoPieceTable(
						snapshot,
						entry.offset,
						entry.insertedText
					)
				}
			}

			return snapshot
		})

		cursor.lines.applyEdit(entry.offset, deletedTextForTree, insertedTextForTree)

		if (direction === 'undo') {
			applyCursorSnapshot(entry.cursorBefore, entry.selectionBefore)
		} else {
			applyCursorSnapshot(entry.cursorAfter, entry.selectionAfter)
		}

		if (incrementalEdit) {
			document.applyIncrementalEdit?.(incrementalEdit)
		}
	}

	const recordChange = (
		change: HistoryChangeInput,
		options?: { mergeMode?: HistoryMergeMode }
	) => {
		const path = filePath()
		if (!path) return
		if (!document.isEditable()) return
		if (!change.insertedText && !change.deletedText) return

		const entry = createHistoryEntry(change, Date.now(), options?.mergeMode)
		historyLogger.debug('recording history entry', {
			path,
			entry: summarizeEntry(entry),
		})
		const currentState = getHistoryState(path)
		const undoStack = currentState.undoStack.slice()
		const redoStack: HistoryEntry[] = []

		const lastEntry = undoStack[undoStack.length - 1]
		if (
			lastEntry &&
			entry.mergeMode &&
			lastEntry.mergeMode === entry.mergeMode
		) {
			const merged = mergeHistoryEntries(lastEntry, entry)
			if (merged) {
				undoStack[undoStack.length - 1] = merged
				historyLogger.debug('merged history entry', {
					path,
					result: summarizeEntry(merged),
				})
			} else {
				undoStack.push(entry)
				historyLogger.debug('could not merge entry, pushed separately', {
					path,
				})
			}
		} else {
			undoStack.push(entry)
			historyLogger.debug('pushed new history entry', { path })
		}

		if (undoStack.length > MAX_HISTORY_ENTRIES) {
			undoStack.shift()
			historyLogger.debug('trimmed history stack to max entries', {
				path,
				max: MAX_HISTORY_ENTRIES,
			})
		}

		setHistoryState(path, {
			undoStack,
			redoStack,
		})
	}

	const undo = () => {
		const path = filePath()
		if (!path) return
		if (!document.isEditable()) return
		const state = getHistoryState(path)
		if (state.undoStack.length === 0) return

		const entry = state.undoStack[state.undoStack.length - 1]
		if (!entry) return
		historyLogger.debug('undo', { path, entry: summarizeEntry(entry) })
		applyHistoryEntry(entry, 'undo')

		setHistoryState(path, {
			undoStack: state.undoStack.slice(0, -1),
			redoStack: [...state.redoStack, entry],
		})
	}

	const redo = () => {
		const path = filePath()
		if (!path) return
		if (!document.isEditable()) return
		const state = getHistoryState(path)
		if (state.redoStack.length === 0) return

		const entry = state.redoStack[state.redoStack.length - 1]
		if (!entry) return
		historyLogger.debug('redo', { path, entry: summarizeEntry(entry) })
		applyHistoryEntry(entry, 'redo')

		setHistoryState(path, {
			undoStack: [...state.undoStack, entry],
			redoStack: state.redoStack.slice(0, -1),
		})
	}

	const canUndo = createMemo(() => {
		const path = filePath()
		if (!path) return false
		return getHistoryState(path).undoStack.length > 0
	})

	const canRedo = createMemo(() => {
		const path = filePath()
		if (!path) return false
		return getHistoryState(path).redoStack.length > 0
	})

	const clear = () => {
		const path = filePath()
		if (!path) return
		historyLogger.debug('clearing history state', { path })
		setHistoryState(path, createEmptyHistoryState())
	}

	return {
		recordChange,
		undo,
		redo,
		canUndo,
		canRedo,
		clear,
	}
}

export const deleteHistoryStateForPath = (path: string) => {
	if (!historyStore.has(path)) return
	historyStore.delete(path)
	historyLogger.debug('deleted history state', { path })
}
