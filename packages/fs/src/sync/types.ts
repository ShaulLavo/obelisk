
// Forward declaration to avoid circular dependency
export interface FileStateTracker {
	readonly path: string
	readonly syncState: SyncState
	readonly isDirty: boolean
	readonly hasExternalChanges: boolean
	readonly mode: 'tracked' | 'reactive'
	getLocalContent(): ContentHandle
	getBaseContent(): ContentHandle
	getDiskContent?(): ContentHandle
}

/**
 * Sync state representing the relationship between base, local, and disk content
 */
export type SyncState =
	| 'synced' // Base === local === disk
	| 'local-changes' // Local differs from base, disk unchanged
	| 'external-changes' // Disk differs from base, no local changes
	| 'conflict' // Both local and disk differ from base

/**
 * Abstraction over file content that can be swapped for Y.Doc in the future
 */
export interface ContentHandle {
	/** Get content hash for comparison */
	hash(): string
	/** Compare with another handle */
	equals(other: ContentHandle): boolean
	/** Get raw bytes */
	toBytes(): Uint8Array
	/** Get as string (UTF-8) */
	toString(): string
}

/**
 * Factory for creating ContentHandle instances
 */
export interface ContentHandleFactory {
	/** Create handle from bytes */
	fromBytes(data: Uint8Array): ContentHandle
	/** Create handle from string */
	fromString(data: string): ContentHandle
	/** Create empty handle */
	empty(): ContentHandle
}

/**
 * Token for tracking self-initiated writes
 */
export interface WriteToken {
	readonly id: string
	readonly path: string
	readonly createdAt: number
	readonly expectedMtimeMin: number // mtime should be >= this after write
}

/**
 * Options for tracking a file
 */
export interface TrackOptions {
	initialContent?: Uint8Array | string
	reactive?: boolean
}

/**
 * Event types emitted by the sync layer
 */
export type SyncEventType =
	| 'external-change'
	| 'conflict'
	| 'reloaded'
	| 'local-changes-discarded'
	| 'deleted'
	| 'synced'

/**
 * Base sync event
 */
export interface SyncEvent {
	type: SyncEventType
	path: string
	tracker: FileStateTracker
}

/**
 * Event emitted when external changes are detected (no local changes)
 */
export interface ExternalChangeEvent extends SyncEvent {
	type: 'external-change'
	newMtime: number
}

/**
 * Event emitted when a conflict is detected
 */
export interface ConflictEvent extends SyncEvent {
	type: 'conflict'
	baseContent: ContentHandle
	localContent: ContentHandle
	diskContent: ContentHandle
}

/**
 * Event emitted when a reactive file is reloaded
 */
export interface ReloadedEvent extends SyncEvent {
	type: 'reloaded'
	newContent: ContentHandle
}

/**
 * Event emitted when a file is deleted externally
 */
export interface DeletedEvent extends SyncEvent {
	type: 'deleted'
}

/**
 * Event emitted when local changes are discarded (reactive files)
 */
export interface LocalChangesDiscardedEvent extends SyncEvent {
	type: 'local-changes-discarded'
}

/**
 * Event emitted when file is synced
 */
export interface SyncedEvent extends SyncEvent {
	type: 'synced'
}

/**
 * Union of all sync events
 */
export type SyncEventMap = {
	'external-change': ExternalChangeEvent
	conflict: ConflictEvent
	reloaded: ReloadedEvent
	'local-changes-discarded': LocalChangesDiscardedEvent
	deleted: DeletedEvent
	synced: SyncedEvent
}

/**
 * Handler for sync events
 */
export type SyncEventHandler<E extends SyncEventType> = (
	event: SyncEventMap[E]
) => void
