import type { Accessor } from 'solid-js'
import type { FilePath, SyncState } from '@repo/fs'

/**
 * Where did the conflict come from?
 * Extensible for future git/cloud sync support.
 */
export type ConflictSource =
	| 'external-file'
	| 'git-merge'
	| 'git-rebase'
	| 'cloud-sync'

/**
 * Reactive document state with Solid signals.
 *
 * Document owns content caching via signals. VFS layer is stateless for content.
 * This is the bridge between raw file I/O and the reactive UI.
 */
export interface Document {
	readonly path: FilePath

	/**
	 * Current local content. Updated by setContent() or reload().
	 * This is what the user sees in the editor.
	 */
	readonly content: Accessor<string>

	/**
	 * Base content - the last synced version.
	 * Used to detect conflicts and compute isDirty.
	 */
	readonly baseContent: Accessor<string>

	/**
	 * Disk content - what's currently on disk.
	 * Updated by SyncController when external changes detected.
	 */
	readonly diskContent: Accessor<string>

	/**
	 * Derived sync state based on content comparisons.
	 * - 'synced': local === base === disk
	 * - 'local-changes': local differs from base, disk unchanged
	 * - 'external-changes': disk differs from base, no local changes
	 * - 'conflict': both local and disk differ from base
	 */
	readonly syncState: Accessor<SyncState>

	/**
	 * Whether local content differs from base content.
	 */
	readonly isDirty: Accessor<boolean>

	/**
	 * Whether there are external changes (disk changed since last sync).
	 */
	readonly hasExternalChanges: Accessor<boolean>

	/**
	 * Last time we synced with disk (load or save).
	 */
	readonly lastSyncedAt: Accessor<number | null>

	/**
	 * Disk mtime from last read.
	 */
	readonly diskMtime: Accessor<number | null>

	/**
	 * Current conflicts (if any).
	 */
	readonly conflicts: Accessor<ConflictInfo[]>

	/**
	 * Where content is coming from.
	 * - 'memory': content loaded and in memory
	 * - 'unloaded': not yet loaded from disk
	 */
	readonly contentSource: Accessor<'memory' | 'unloaded'>

	/**
	 * Whether disk content differs from what we last loaded.
	 * True = external changes detected since last load/save.
	 */
	readonly isStale: Accessor<boolean>

	/**
	 * Update local content. Marks document as dirty if different from base.
	 */
	setContent(content: string): void

	/**
	 * Load content from disk. Updates base, local, and disk to match.
	 */
	load(): Promise<void>

	/**
	 * Save local content to disk. Updates base and disk to match local.
	 */
	save(): Promise<void>

	/**
	 * Discard local changes and reload from disk.
	 */
	reload(): Promise<void>

	/**
	 * Called by SyncController when disk content changes externally.
	 * Updates diskContent signal without affecting local.
	 */
	notifyExternalChange(content: string, mtime: number): void

	/**
	 * Resolve conflict by keeping local changes (write to disk).
	 */
	resolveKeepLocal(): Promise<void>

	/**
	 * Resolve conflict by accepting disk content (discard local).
	 */
	resolveAcceptDisk(): Promise<void>

	/**
	 * Resolve conflict with merged content.
	 */
	resolveMerge(mergedContent: string): Promise<void>
}

/**
 * Conflict information for UI display.
 */
export interface ConflictInfo {
	source: ConflictSource
	detectedAt: number
	message?: string
}

/**
 * Document store options.
 */
export interface DocumentStoreOptions {
	/**
	 * RootCtx from @repo/fs for I/O operations.
	 */
	rootCtx: {
		file(path: string, mode?: string): {
			text(): Promise<string>
			write(content: string): Promise<void>
			lastModified(): Promise<number>
		}
	}

	/**
	 * Optional SyncController to listen for external changes.
	 */
	syncController?: {
		watch(path: string): void
		unwatch(path: string): void
		on(event: string, handler: (e: any) => void): () => void
	}
}

/**
 * Manages multiple documents with reactive tracking.
 */
export interface DocumentStore {
	/**
	 * Open or get existing document for a path.
	 */
	open(path: FilePath): Document

	/**
	 * Close document and clean up resources.
	 */
	close(path: FilePath): void

	/**
	 * Get document if already open.
	 */
	get(path: FilePath): Document | undefined

	/**
	 * All currently open documents.
	 */
	readonly documents: Accessor<Map<FilePath, Document>>

	/**
	 * Documents with unsaved changes.
	 */
	readonly dirtyDocuments: Accessor<Document[]>

	/**
	 * Save all dirty documents.
	 */
	saveAll(): Promise<void>

	/**
	 * Reload all documents from disk.
	 */
	reloadAll(): Promise<void>

	/**
	 * Clean up all resources.
	 */
	dispose(): void
}
