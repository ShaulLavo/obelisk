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
