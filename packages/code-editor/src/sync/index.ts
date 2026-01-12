// Core sync manager
export { EditorFileSyncManager } from './editor-file-sync-manager'
export type { EditorFileSyncManagerOptions, NotificationSystem } from './editor-file-sync-manager'

// Editor registry
export { EditorRegistryImpl } from './editor-registry'

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
	PendingConflict,
	BatchResolutionResult,
} from './types'

export { DEFAULT_EDITOR_SYNC_CONFIG, deriveSyncStatusType } from './types'

// Conflict resolution utilities
export { getStrategyDisplayName, canAutoResolve, createResolution } from './conflict-manager'

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
} from './status-derivation'

// Status display utilities
export {
	getStatusDescription,
	getStatusClassName,
	getStatusBgColor,
	getStatusBadgeColor,
	getStatusIcon,
	getStatusShortText,
} from './sync-status-tracker'

// Editor state management
export { EditorStateManager } from './editor-state-manager'

// Batch undo management
export { BatchUndoManager, createBatchUndoManager } from './batch-undo-manager'
export type {
	BatchUndoManagerOptions,
	BatchUndoOperation,
	FileUndoState,
	UndoResult,
} from './batch-undo-manager'

// Reactive context and hooks
export { 
	SyncStatusProvider, 
	useSyncStatusContext, 
	createSyncStatus, 
	createMultiSyncStatus,
	createConflictTracker,
	createAllSyncStatuses 
} from './context/SyncStatusContext'
export type { SyncStatusProviderProps } from './context/SyncStatusContext'

// Aggregated status hook
export { createAggregatedSyncStatus } from './hooks/createSyncStatusHooks'

// UI Components
export * from './ui'