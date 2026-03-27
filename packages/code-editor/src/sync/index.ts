// Editor registry
export { EditorRegistryImpl } from './editorRegistry'

// Types
export type {
	SyncStatusType,
	SyncStatusInfo,
	CursorPosition,
	EditorScrollPosition,
	FoldedRegion,
	TextSelection,
	EditorState,
	EditorInstance,
	EditorRegistry,
	EditorSyncConfig,
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
	NotificationSystem,
} from './types'

export { DEFAULT_EDITOR_SYNC_CONFIG, deriveSyncStatusType } from './types'

// Conflict resolution utilities
export { getStrategyDisplayName, canAutoResolve, createResolution } from './conflictManager'

// Status derivation (pure functions)
export {
	createInitialStatus,
	createErrorStatus,
	createSyncedStatus,
	createConflictStatus,
	deriveStatusFromExternalChange,
	deriveStatusFromDirtyChange,
	deriveStatusFromSynced,
	deriveStatusFromDeletion,
	NOT_WATCHED_STATUS,
} from './statusDerivation'

// Status display utilities
export {
	getStatusDescription,
	getStatusClassName,
	getStatusBgColor,
	getStatusBadgeColor,
	getStatusIcon,
	getStatusShortText,
} from './syncStatusTracker'

// Editor state management
export { EditorStateManager } from './editorStateManager'

// Batch undo management
export { BatchUndoManager, createBatchUndoManager } from './batchUndoManager'
export type {
	BatchUndoManagerOptions,
	BatchUndoOperation,
	FileUndoState,
	UndoResult,
} from './batchUndoManager'
