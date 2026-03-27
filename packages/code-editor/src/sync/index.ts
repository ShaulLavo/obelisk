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
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
} from './types'

export { deriveSyncStatusType } from './types'

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

// Batch undo management
export { BatchUndoManager } from './batchUndoManager'
