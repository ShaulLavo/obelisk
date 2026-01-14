import type {
	FileSystemChangeRecord,
} from '../FileSystemObserver'
import type {
	SyncEventType,
	SyncEventHandler,
	ExternalFileChangeEvent,
	FileDeletedEvent,
} from './sync-types'
import {
	FileSystemObserverManager,
	type ObserverStrategy,
} from './observer-strategy'

export interface SyncControllerOptions {
	debounceMs?: number
}

/**
 * SyncController - Detects external file changes and emits events.
 *
 * This is the bridge between the file system and the Document layer.
 * It owns the FileSystemObserver and emits typed events when changes occur.
 *
 * The Document layer subscribes to these events and decides how to handle them
 * (reload, show conflict UI, etc).
 *
 * NO STATE TRACKING - Document layer owns state via Solid signals.
 * NO WRITE TOKENS - Saves update state synchronously in Document layer.
 */
export class SyncController {
	private readonly debounceMs: number
	private readonly observerManager = new FileSystemObserverManager()
	private observerStrategy: ObserverStrategy | null = null
	private observerUnsubscribe: (() => void) | null = null
	private debounceTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
	private eventHandlers = new Map<SyncEventType, Set<SyncEventHandler<any>>>()
	private rootHandle: FileSystemDirectoryHandle | null = null
	private watchedPaths = new Set<string>()

	constructor(options: SyncControllerOptions = {}) {
		this.debounceMs = options.debounceMs ?? 100
	}

	/**
	 * Start watching a path for changes.
	 * Call this for each file/directory you want to track.
	 */
	watch(path: string): void {
		this.watchedPaths.add(path)
	}

	/**
	 * Stop watching a path.
	 */
	unwatch(path: string): void {
		this.watchedPaths.delete(path)
		const timeout = this.debounceTimeouts.get(path)
		if (timeout) {
			clearTimeout(timeout)
			this.debounceTimeouts.delete(path)
		}
	}

	/**
	 * Initialize observer with root handle.
	 * Must be called before changes can be detected.
	 */
	async start(root: FileSystemDirectoryHandle): Promise<void> {
		if (this.observerStrategy) {
			return
		}

		this.rootHandle = root
		this.observerStrategy = this.observerManager.createStrategy()
		this.observerUnsubscribe = this.observerStrategy.on('change', (changes) => {
			this.handleChanges(changes)
		})

		try {
			await this.observerStrategy.observe(root)
		} catch (error) {
			this.stop()
			throw error
		}
	}

	/**
	 * Stop observing changes.
	 */
	stop(): void {
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
		this.rootHandle = null
	}

	/**
	 * Subscribe to sync events.
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
	 * Emit a sync event to all registered handlers.
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
				} catch {
					// Silently swallow handler errors to not break other handlers
				}
			}
		}
	}

	/**
	 * Handle raw file system changes from observer.
	 */
	private handleChanges(changes: FileSystemChangeRecord[]): void {
		const changesByPath = new Map<string, FileSystemChangeRecord[]>()

		for (const change of changes) {
			const path = change.relativePathComponents.join('/')

			// Only process changes for watched paths
			if (!this.watchedPaths.has(path)) {
				continue
			}

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
	 * Process debounced changes for a specific path.
	 */
	private processPathChanges(
		path: string,
		changes: FileSystemChangeRecord[]
	): void {
		const latestChange = changes[changes.length - 1]
		if (!latestChange) {
			return
		}

		const now = Date.now()

		if (latestChange.type === 'disappeared') {
			this.emit<'deleted'>('deleted', {
				type: 'deleted',
				path,
				detectedAt: now,
			} satisfies FileDeletedEvent)
			return
		}

		if (latestChange.type === 'appeared' || latestChange.type === 'modified') {
			this.emit<'external-change'>('external-change', {
				type: 'external-change',
				path,
				detectedAt: now,
			} satisfies ExternalFileChangeEvent)
		}
	}

	/**
	 * Clean up all resources.
	 */
	dispose(): void {
		this.stop()
		this.eventHandlers.clear()
		this.watchedPaths.clear()
	}

	/**
	 * Check if the observer is currently running.
	 */
	get isRunning(): boolean {
		return this.observerStrategy !== null
	}

	/**
	 * Get the root handle being observed.
	 */
	get root(): FileSystemDirectoryHandle | null {
		return this.rootHandle
	}
}
