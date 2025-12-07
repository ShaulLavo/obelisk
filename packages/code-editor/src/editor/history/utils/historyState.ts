import type { HistoryState } from '../types'

export const createEmptyHistoryState = (): HistoryState => ({
	undoStack: [],
	redoStack: []
})
