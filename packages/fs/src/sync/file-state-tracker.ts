import type { ContentHandle, ContentHandleFactory, SyncState } from './types'
import { ByteContentHandleFactory } from './content-handle'

// Forward declaration for FsContext - will be properly imported when integrated
interface FsContext {
	file(path: string, mode?: 'r' | 'rw' | 'rw-unsafe'): {
		write(content: string | BufferSource | import('../vfs/types').VfsReadableStream, opts?: { truncate?: boolean }): Promise<void>
		text(): Promise<string>
		lastModified(): Promise<number>
	}
}

/**
 * Tracks the state of a single file
 */
export class FileStateTracker {
	private baseContent: ContentHandle
	private localContent: ContentHandle
	private diskContent: ContentHandle
	private diskMtime: number
	private contentHandleFactory: ContentHandleFactory
	private fsContext?: FsContext

	constructor(
		public readonly path: string,
		public readonly mode: 'tracked' | 'reactive',
		initialContent: ContentHandle,
		initialMtime: number,
		contentHandleFactory: ContentHandleFactory = ByteContentHandleFactory,
		fsContext?: FsContext
	) {
		this.baseContent = initialContent
		this.localContent = initialContent
		this.diskContent = initialContent
		this.diskMtime = initialMtime
		this.contentHandleFactory = contentHandleFactory
		this.fsContext = fsContext
	}

	/**
	 * Get current sync state based on content comparison
	 */
	get syncState(): SyncState {
		const localEqualsBase = this.localContent.equals(this.baseContent)
		const baseEqualsDisk = this.baseContent.equals(this.diskContent)

		if (localEqualsBase && baseEqualsDisk) {
			return 'synced'
		}
		if (!localEqualsBase && baseEqualsDisk) {
			return 'local-changes'
		}
		if (localEqualsBase && !baseEqualsDisk) {
			return 'external-changes'
		}
		return 'conflict'
	}

	/**
	 * Check if file has unsaved local changes
	 */
	get isDirty(): boolean {
		return !this.localContent.equals(this.baseContent)
	}

	/**
	 * Check if file has external changes
	 */
	get hasExternalChanges(): boolean {
		const state = this.syncState
		return state === 'external-changes' || state === 'conflict'
	}

	/**
	 * Get current local content
	 */
	getLocalContent(): ContentHandle {
		return this.localContent
	}

	/**
	 * Get base content (last synced state)
	 */
	getBaseContent(): ContentHandle {
		return this.baseContent
	}

	/**
	 * Update local content (marks dirty if different from base)
	 */
	setLocalContent(content: Uint8Array | string): void {
		if (content instanceof Uint8Array) {
			this.localContent = this.contentHandleFactory.fromBytes(content)
		} else {
			this.localContent = this.contentHandleFactory.fromString(content)
		}
	}

	/**
	 * Mark as synced with current disk state
	 */
	markSynced(diskContent: Uint8Array, diskMtime: number): void {
		const diskHandle = this.contentHandleFactory.fromBytes(diskContent)
		this.baseContent = diskHandle
		this.localContent = diskHandle
		this.diskContent = diskHandle
		this.diskMtime = diskMtime
	}

	/**
	 * Get current disk content (for conflict resolution)
	 */
	getDiskContent(): ContentHandle {
		return this.diskContent
	}

	/**
	 * Update the disk content (called by sync manager when external changes detected)
	 */
	updateDiskState(diskContent: Uint8Array, diskMtime: number): void {
		this.diskContent = this.contentHandleFactory.fromBytes(diskContent)
		this.diskMtime = diskMtime
	}

	/**
	 * Resolve conflict by keeping local changes
	 * Updates base content to match local and writes to disk
	 */
	async resolveKeepLocal(): Promise<void> {
		if (!this.fsContext) {
			throw new Error('Cannot resolve conflict: no file system context provided')
		}

		// Write local content to disk
		const file = this.fsContext.file(this.path, 'rw')
		await file.write(this.localContent.toBytes() as BufferSource)

		// Update base and disk content to match local
		this.baseContent = this.localContent
		this.diskContent = this.localContent

		// Update disk mtime (we'll get the actual mtime from the file system)
		const newMtime = await file.lastModified()
		this.diskMtime = newMtime
	}

	/**
	 * Resolve conflict by accepting external changes
	 * Updates local content to match disk and clears dirty flag
	 */
	async resolveAcceptExternal(): Promise<void> {
		if (!this.fsContext) {
			throw new Error('Cannot resolve conflict: no file system context provided')
		}

		// Read current disk content
		const file = this.fsContext.file(this.path, 'r')
		const diskContentStr = await file.text()
		const newMtime = await file.lastModified()

		// Update local and base content to match disk
		const diskHandle = this.contentHandleFactory.fromString(diskContentStr)
		this.localContent = diskHandle
		this.baseContent = diskHandle
		this.diskContent = diskHandle
		this.diskMtime = newMtime
	}

	/**
	 * Resolve conflict with merged content
	 * Sets merged content as the new local content
	 */
	async resolveMerge(mergedContent: Uint8Array | string): Promise<void> {
		if (!this.fsContext) {
			throw new Error('Cannot resolve conflict: no file system context provided')
		}

		// Set merged content as local
		if (mergedContent instanceof Uint8Array) {
			this.localContent = this.contentHandleFactory.fromBytes(mergedContent)
		} else {
			this.localContent = this.contentHandleFactory.fromString(mergedContent)
		}

		// Write merged content to disk
		const file = this.fsContext.file(this.path, 'rw')
		await file.write(this.localContent.toBytes() as BufferSource)

		// Update base and disk content to match the merged content
		this.baseContent = this.localContent
		this.diskContent = this.localContent

		// Update disk mtime
		const newMtime = await file.lastModified()
		this.diskMtime = newMtime
	}
}