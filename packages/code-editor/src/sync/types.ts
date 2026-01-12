/**
 * Sync status types for editor files
 */
export type SyncStatusType =
	| 'synced'           // File is up to date, no changes
	| 'dirty'            // Local changes not saved
	| 'external-changes' // External changes detected, no local changes
	| 'conflict'         // Both local and external changes
	| 'error'            // Sync error occurred
	| 'not-watched'      // File not being watched

/**
 * Derive the sync status type from the two source booleans.
 * This is the single source of truth for status type computation.
 *
 * Truth table:
 * - error message present -> 'error'
 * - hasLocal && hasExternal -> 'conflict'
 * - hasLocal only -> 'dirty'
 * - hasExternal only -> 'external-changes'
 * - neither -> 'synced'
 */
export function deriveSyncStatusType(
	hasLocalChanges: boolean,
	hasExternalChanges: boolean,
	errorMessage?: string
): SyncStatusType {
	if (errorMessage) return 'error'
	if (hasLocalChanges && hasExternalChanges) return 'conflict'
	if (hasLocalChanges) return 'dirty'
	if (hasExternalChanges) return 'external-changes'
	return 'synced'
}

/**
 * Sync status information for a file
 */
export interface SyncStatusInfo {
	type: SyncStatusType
	lastSyncTime: number
	hasLocalChanges: boolean
	hasExternalChanges: boolean
	errorMessage?: string
}

/**
 * Cursor position in the editor
 */
export interface CursorPosition {
	line: number
	column: number
}

/**
 * Scroll position in the editor for sync purposes
 */
export interface EditorScrollPosition {
	scrollTop: number
	scrollLeft: number
}

/**
 * Folded region in the editor
 */
export interface FoldedRegion {
	startLine: number
	endLine: number
}

/**
 * Text selection in the editor
 */
export interface TextSelection {
	start: CursorPosition
	end: CursorPosition
}

/**
 * Editor state for preservation during updates
 */
export interface EditorState {
	cursorPosition: CursorPosition
	scrollPosition: EditorScrollPosition
	foldedRegions: FoldedRegion[]
	selection?: TextSelection
}

/**
 * Interface for integrating with different editor implementations
 */
export interface EditorInstance {
	/** Get current editor content */
	getContent(): string
	
	/** Set editor content */
	setContent(content: string): void
	
	/** Check if editor has unsaved changes */
	isDirty(): boolean
	
	/** Mark editor as clean (saved) */
	markClean(): void
	
	/** Get current cursor position */
	getCursorPosition(): CursorPosition
	
	/** Set cursor position */
	setCursorPosition(position: CursorPosition): void
	
	/** Get current scroll position */
	getScrollPosition(): EditorScrollPosition
	
	/** Set scroll position */
	setScrollPosition(position: EditorScrollPosition): void
	
	/** Get folded regions */
	getFoldedRegions(): FoldedRegion[]
	
	/** Set folded regions */
	setFoldedRegions(regions: FoldedRegion[]): void
	
	/** Subscribe to content changes */
	onContentChange(callback: (content: string) => void): () => void
	
	/** Subscribe to dirty state changes */
	onDirtyStateChange(callback: (isDirty: boolean) => void): () => void
}

/**
 * Registry for tracking open editors
 */
export interface EditorRegistry {
	/** Get editor instance for a file path */
	getEditor(path: string): EditorInstance | undefined
	
	/** Get all open file paths */
	getOpenFiles(): string[]
	
	/** Subscribe to editor open/close events */
	onEditorOpen(callback: (path: string, editor: EditorInstance) => void): () => void
	onEditorClose(callback: (path: string) => void): () => void
}

/**
 * Configuration for editor sync behavior
 */
export interface EditorSyncConfig {
	/** Enable automatic file watching */
	autoWatch: boolean
	
	/** Enable auto-reload for clean files */
	autoReload: boolean
	
	/** Debounce delay for change notifications (ms) */
	debounceMs: number
	
	/** Default conflict resolution strategy */
	defaultConflictResolution: ConflictResolutionStrategy
	
	/** Maximum number of files to watch simultaneously (0 = unlimited) */
	maxWatchedFiles: number
	
	/** Show notifications for auto-reloads */
	showReloadNotifications: boolean
	
	/** Preserve editor state during updates */
	preserveEditorState: boolean
}

/**
 * Conflict resolution strategies
 */
export type ConflictResolutionStrategy = 
	| 'keep-local'      // Keep local changes, overwrite external
	| 'use-external'    // Discard local changes, use external
	| 'manual-merge'    // Show diff view for manual resolution
	| 'skip'            // Skip this file for now

/**
 * Information about a file conflict
 */
export interface ConflictInfo {
	/** File path */
	path: string
	/** Base content (last known synced state) */
	baseContent: string
	/** Local content (current editor content) */
	localContent: string
	/** External content (content from disk) */
	externalContent: string
	/** Last modified time of external file */
	lastModified: number
	/** Timestamp when conflict was detected */
	conflictTimestamp: number
}

/**
 * Result of conflict resolution
 */
export interface ConflictResolution {
	/** Strategy used to resolve the conflict */
	strategy: ConflictResolutionStrategy
	/** Merged content (for manual merge strategy) */
	mergedContent?: string
}

/**
 * Result of batch conflict resolution
 */
export interface BatchResolutionResult {
	/** Individual resolutions for each file */
	resolutions: Map<string, ConflictResolution>
	/** Strategy to apply to all files (if selected) */
	applyToAll?: ConflictResolutionStrategy
}

/**
 * Pending conflict information for tracking
 */
export interface PendingConflict {
	/** File path */
	path: string
	/** Conflict information */
	conflictInfo: ConflictInfo
	/** Timestamp when conflict was detected */
	timestamp: number
}

/**
 * Default configuration values
 */
export const DEFAULT_EDITOR_SYNC_CONFIG: EditorSyncConfig = {
	autoWatch: true,
	autoReload: true,
	debounceMs: 100,
	defaultConflictResolution: 'manual-merge',
	maxWatchedFiles: 0, // 0 = unlimited (watches all open tabs)
	showReloadNotifications: true,
	preserveEditorState: true,
}