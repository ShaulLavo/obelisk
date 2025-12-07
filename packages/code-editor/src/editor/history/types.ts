import type { JSX } from 'solid-js'
import type { TextEditorDocument } from '../types'
import type { CursorPosition, SelectionRange } from '../cursor/types'

export type HistoryMergeMode = 'insert' | 'delete'

export type HistoryChangeInput = {
	offset: number
	insertedText: string
	deletedText: string
	cursorBefore: CursorPosition
	cursorAfter: CursorPosition
	selectionBefore: SelectionRange | null
	selectionAfter: SelectionRange | null
}

export type HistoryEntry = HistoryChangeInput & {
	timestamp: number
	mergeMode?: HistoryMergeMode
}

export type HistoryState = {
	undoStack: HistoryEntry[]
	redoStack: HistoryEntry[]
}

export type HistoryContextValue = {
	recordChange: (
		change: HistoryChangeInput,
		options?: { mergeMode?: HistoryMergeMode }
	) => void
	undo: () => void
	redo: () => void
	canUndo: () => boolean
	canRedo: () => boolean
	clear: () => void
}

export type HistoryProviderProps = {
	document: TextEditorDocument
	children: JSX.Element
}
