/**
 * Re-export from HistoryModel for backward compatibility and module organization.
 */
export {
	createHistoryEntry,
	mergeHistoryEntries,
	recordChange,
	undo,
	redo,
	canUndo,
	canRedo,
	createHistoryState,
	DEFAULT_MAX_HISTORY_ENTRIES,
	DEFAULT_MERGE_WINDOW_MS,
} from './HistoryModel'

export type { HistoryChangeInput, UndoRedoResult } from './HistoryModel'
