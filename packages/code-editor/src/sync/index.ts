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

export { deriveSyncStatusType, NOT_WATCHED_STATUS } from './types'
