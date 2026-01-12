import type {
	ContentHandleFactory,
	TrackOptions,
	SyncEventType,
	SyncEventHandler,
	WriteToken,
	ExternalChangeEvent,
	ConflictEvent,
	ReloadedEvent,
	LocalChangesDiscardedEvent,
	DeletedEvent,
	SyncedEvent,
} from './types'
import type { FsContext } from '../vfs/types'
import type { FileSystemChangeRecord } from '../FileSystemObserver'
import { FileStateTracker } from './file-state-tracker'
import { WriteTokenManager } from './write-token-manager'
import { ByteContentHandleFactory } from './content-handle'
import {
	FileSystemObserverManager,
	type ObserverStrategy,
} from './observer-strategy'

/**
 * Options for FileSyncManager
 */
export interface FileSyncManagerOptions {
	/** The FsContext to use for file operations */
	fs: FsContext
	/** Debounce window for batching changes (default: 100ms) */
	debounceMs?: number
	/** Write token expiry time (default: 5000ms) */
	tokenExpiryMs?: number
	/** Custom content handle factory (for future CRDT support) */
	contentHandleFactory?: ContentHandleFactory
}

/**
 * Central coordinator that manages all file tracking operations
 */
export class FileSyncManager {
	private readonly fs: FsContext
	private readonly debounceMs: number
	private readonly contentHandleFactory: ContentHandleFactory
	private readonly writeTokenManager: WriteTokenManager
	private readonly observerManager: FileSystemObserverManager
	private readonly trackers = new Map<string, FileStateTracker>()
	private readonly eventHandlers = new Map<
		SyncEventType,
		Set<SyncEventHandler<any>>
	>()
	private observerStrategy: ObserverStrategy | null = null
	private observerUnsubscribe: (() => void) | null = null
	private debounceTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

	constructor(options: FileSyncManagerOptions) {
		this.fs = options.fs
		this.debounceMs = options.debounceMs ?? 100
		this.contentHandleFactory =
			options.contentHandleFactory ?? ByteContentHandleFactory
		this.writeTokenManager = new WriteTokenManager({
			tokenExpiryMs: options.tokenExpiryMs,
		})
		this.observerManager = new FileSystemObserverManager()
	}

	/**
	 * Register a file for tracking
	 */
	async track(
		path: string,
		options: TrackOptions = {}
	): Promise<FileStateTracker> {
		const existingTracker = this.trackers.get(path)
		if (existingTracker) {
			return existingTracker
		}

		let initialContent: Uint8Array
		let initialMtime: number

		if (options.initialContent) {
			if (typeof options.initialContent === 'string') {
				initialContent = new TextEncoder().encode(options.initialContent)
			} else {
				initialContent = options.initialContent
			}
			try {
				const file = this.fs.file(path, 'r')
				initialMtime = await file.lastModified()
			} catch {
				initialMtime = Date.now()
			}
		} else {
			try {
				const file = this.fs.file(path, 'r')
				const content = await file.text()
				initialContent = new TextEncoder().encode(content)
				initialMtime = await file.lastModified()
			} catch {
				initialContent = new Uint8Array(0)
				initialMtime = Date.now()
			}
		}

		const initialHandle = this.contentHandleFactory.fromBytes(initialContent)

		const mode = options.reactive ? 'reactive' : 'tracked'
		const tracker = new FileStateTracker(
			path,
			mode,
			initialHandle,
			initialMtime,
			this.contentHandleFactory,
			this.fs
		)

		this.trackers.set(path, tracker)

		await this.ensureObserverStarted()

		return tracker
	}

	/**
	 * Stop tracking a file
	 */
	untrack(path: string): void {
		const tracker = this.trackers.get(path)
		if (!tracker) {
			return
		}

		this.trackers.delete(path)

		this.writeTokenManager.clearToken(path)

		if (this.trackers.size === 0) {
			this.stopObserver()
		}
	}

	/**
	 * Get tracker for a path (if tracked)
	 */
	getTracker(path: string): FileStateTracker | undefined {
		return this.trackers.get(path)
	}

	/**
	 * Notify the manager that a write is about to happen (returns token)
	 * @param path - The file path being written to
	 * @param contentHash - Optional hash of the content being written for reliable self-write detection
	 */
	beginWrite(path: string, contentHash?: string): WriteToken {
		return this.writeTokenManager.generateToken(path, contentHash)
	}

	/**
	 * Confirm write completed (clears token on observer match)
	 */
	endWrite(token: WriteToken): void {
		// Token will be automatically cleared when observer detects change and matches it
	}

	/**
	 * Subscribe to sync events
	 */
	on<E extends SyncEventType>(
		event: E,
		handler: SyncEventHandler<E>
	): () => void {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set())
		}
		const handlers = this.eventHandlers.get(event)!
		handlers.add(handler)

		return () => {
			handlers.delete(handler)
			if (handlers.size === 0) {
				this.eventHandlers.delete(event)
			}
		}
	}

	/**
	 * Emit a sync event to all registered handlers
	 */
	private emit<E extends SyncEventType>(
		event: E,
		eventData: Parameters<SyncEventHandler<E>>[0]
	): void {
		const handlers = this.eventHandlers.get(event)
		if (handlers) {
			for (const handler of handlers) {
				try {
					handler(eventData)
				} catch (error) {
					console.error(`Error in sync event handler for ${event}:`, error)
				}
			}
		}
	}

	/**
	 * Dispose all resources
	 */
	dispose(): void {
		this.trackers.clear()
		this.eventHandlers.clear()
		this.writeTokenManager.dispose()
		this.stopObserver()
	}

	/**
	 * Ensure observer is started for the root directory
	 */
	private async ensureObserverStarted(): Promise<void> {
		if (this.observerStrategy) {
			return
		}

		this.observerStrategy = this.observerManager.createStrategy()

		this.observerUnsubscribe = this.observerStrategy.on('change', (changes) => {
			this.handleFileSystemChanges(changes)
		})

		try {
			await this.observerStrategy.observe(this.fs.root)
		} catch (error) {
			console.error('Failed to start file system observer:', error)
			// Fall back to polling strategy if native fails
			if (this.observerStrategy instanceof (await import('./observer-strategy')).NativeObserverStrategy) {
				this.stopObserver()
				this.observerStrategy = new (await import('./observer-strategy')).PollingObserverStrategy()
				this.observerUnsubscribe = this.observerStrategy.on('change', (changes) => {
					this.handleFileSystemChanges(changes)
				})
				await this.observerStrategy.observe(this.fs.root)
			}
		}
	}

	/**
	 * Stop the observer
	 */
	private stopObserver(): void {
		if (this.observerUnsubscribe) {
			this.observerUnsubscribe()
			this.observerUnsubscribe = null
		}
		if (this.observerStrategy) {
			this.observerStrategy.disconnect()
			this.observerStrategy = null
		}
		for (const timeout of this.debounceTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.debounceTimeouts.clear()
	}

	/**
	 * Handle file system changes from the observer
	 */
	private handleFileSystemChanges(changes: FileSystemChangeRecord[]): void {
		const changesByPath = new Map<string, FileSystemChangeRecord[]>()

		for (const change of changes) {
			const path = change.relativePathComponents.join('/')
			if (!changesByPath.has(path)) {
				changesByPath.set(path, [])
			}
			changesByPath.get(path)!.push(change)
		}

		for (const [path, pathChanges] of changesByPath) {
			const existingTimeout = this.debounceTimeouts.get(path)
			if (existingTimeout) {
				clearTimeout(existingTimeout)
			}

			const timeout = setTimeout(() => {
				this.debounceTimeouts.delete(path)
				this.processPathChanges(path, pathChanges)
			}, this.debounceMs)

			this.debounceTimeouts.set(path, timeout)
		}
	}

	/**
	 * Process changes for a specific path after debouncing
	 */
	private async processPathChanges(
		path: string,
		changes: FileSystemChangeRecord[]
	): Promise<void> {
		const tracker = this.trackers.get(path)
		if (!tracker) {
			return
		}

		const latestChange = changes[changes.length - 1]
		if (!latestChange) {
			return
		}

		try {
			if (latestChange.type === 'disappeared') {
				this.emit<'deleted'>('deleted', {
					type: 'deleted',
					path,
					tracker,
				})
				return
			}

			if (latestChange.type === 'appeared' || latestChange.type === 'modified') {
				await this.handleFileChange(path, tracker)
			}
		} catch (error) {
			console.error(`Error processing changes for ${path}:`, error)
		}
	}

	/**
	 * Compute SHA-256 hash of content for reliable self-write detection
	 */
	private async computeContentHash(content: Uint8Array): Promise<string> {
		const hashBuffer = await crypto.subtle.digest('SHA-256', content as BufferSource)
		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	}

	/**
	 * Handle a file change (creation or modification)
	 */
	private async handleFileChange(
		path: string,
		tracker: FileStateTracker
	): Promise<void> {
		try {
			const file = this.fs.file(path, 'r')
			const diskContentStr = await file.text()
			const diskMtime = await file.lastModified()
			const diskContent = new TextEncoder().encode(diskContentStr)

			// Compute hash for reliable self-write detection
			const contentHash = await this.computeContentHash(diskContent)

			const matchedToken = this.writeTokenManager.matchToken(path, diskMtime, contentHash)
			if (matchedToken) {
				tracker.markSynced(diskContent, diskMtime)
				this.emit<'synced'>('synced', {
					type: 'synced',
					path,
					tracker,
				})
				return
			}

			tracker.updateDiskState(diskContent, diskMtime)

			const syncState = tracker.syncState

			if (tracker.mode === 'reactive') {
				// CRITICAL: Never auto-discard local changes - escalate to conflict
				if (tracker.isDirty) {
					// updateDiskState already called above (line 365)
					// Emit conflict - user must explicitly choose to discard or merge
					this.emit<'conflict'>('conflict', {
						type: 'conflict',
						path,
						tracker,
						baseContent: tracker.getBaseContent(),
						localContent: tracker.getLocalContent(),
						diskContent: tracker.getDiskContent(),
					})
					return
				}

				// Only auto-reload if no local changes (safe)
				const newContent = this.contentHandleFactory.fromBytes(diskContent)
				tracker.setLocalContent(diskContent)
				tracker.markSynced(diskContent, diskMtime)

				this.emit<'reloaded'>('reloaded', {
					type: 'reloaded',
					path,
					tracker,
					newContent,
				})
			} else {
				if (syncState === 'external-changes') {
					this.emit<'external-change'>('external-change', {
						type: 'external-change',
						path,
						tracker,
						newMtime: diskMtime,
					})
				} else if (syncState === 'conflict') {
					this.emit<'conflict'>('conflict', {
						type: 'conflict',
						path,
						tracker,
						baseContent: tracker.getBaseContent(),
						localContent: tracker.getLocalContent(),
						diskContent: tracker.getDiskContent(),
					})
				}
			}
		} catch (error) {
			console.error(`Error handling file change for ${path}:`, error)
		}
	}
}