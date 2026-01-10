import type {
	FileSystemChangeRecord,
	FileSystemObserverCallback,
} from '../FileSystemObserver'
import { createFileSystemObserver, hasNativeObserver } from '../FileSystemObserver'

/**
 * Strategy interface for observing file system changes
 */
export interface ObserverStrategy {
	/** Check if this strategy is available */
	isAvailable(): boolean

	/** Start observing a file or directory */
	observe(handle: FileSystemHandle): Promise<void>

	/** Stop observing */
	disconnect(): void

	/** Subscribe to change events */
	on(event: 'change', handler: (changes: FileSystemChangeRecord[]) => void): () => void
}

/**
 * Native observer strategy using FileSystemObserver constructor
 */
export class NativeObserverStrategy implements ObserverStrategy {
	private observer: ReturnType<typeof createFileSystemObserver> | null = null
	private changeHandlers = new Set<(changes: FileSystemChangeRecord[]) => void>()

	isAvailable(): boolean {
		return hasNativeObserver()
	}

	async observe(handle: FileSystemHandle): Promise<void> {
		if (!this.observer) {
			this.observer = createFileSystemObserver((records) => {
				// Emit to all registered handlers
				for (const handler of this.changeHandlers) {
					try {
						handler(records)
					} catch (error) {
						console.error('Error in observer change handler:', error)
					}
				}
			})
		}

		await this.observer.observe(handle, { recursive: true })
	}

	disconnect(): void {
		if (this.observer) {
			this.observer.disconnect()
			this.observer = null
		}
		this.changeHandlers.clear()
	}

	on(event: 'change', handler: (changes: FileSystemChangeRecord[]) => void): () => void {
		if (event !== 'change') {
			throw new Error(`Unsupported event type: ${event}`)
		}

		this.changeHandlers.add(handler)

		return () => {
			this.changeHandlers.delete(handler)
		}
	}
}

/**
 * Polling observer strategy with recursive directory traversal
 */
export class PollingObserverStrategy implements ObserverStrategy {
	private readonly pollInterval: number
	private observer: ReturnType<typeof createFileSystemObserver> | null = null
	private changeHandlers = new Set<(changes: FileSystemChangeRecord[]) => void>()

	constructor(pollInterval = 500) {
		this.pollInterval = pollInterval
	}

	isAvailable(): boolean {
		// Polling is always available as a fallback
		return true
	}

	async observe(handle: FileSystemHandle): Promise<void> {
		if (!this.observer) {
			this.observer = createFileSystemObserver((records) => {
				// Emit to all registered handlers
				for (const handler of this.changeHandlers) {
					try {
						handler(records)
					} catch (error) {
						console.error('Error in polling observer change handler:', error)
					}
				}
			}, this.pollInterval)
		}

		await this.observer.observe(handle, { recursive: true })
	}

	disconnect(): void {
		if (this.observer) {
			this.observer.disconnect()
			this.observer = null
		}
		this.changeHandlers.clear()
	}

	on(event: 'change', handler: (changes: FileSystemChangeRecord[]) => void): () => void {
		if (event !== 'change') {
			throw new Error(`Unsupported event type: ${event}`)
		}

		this.changeHandlers.add(handler)

		return () => {
			this.changeHandlers.delete(handler)
		}
	}

	/**
	 * Find the last modified time in a directory tree (used by polling)
	 */
	async findLastModified(handle: FileSystemDirectoryHandle): Promise<number> {
		let maxMtime = 0

		try {
			for await (const [, entry] of handle.entries()) {
				if (entry.kind === 'directory') {
					const childMtime = await this.findLastModified(entry as FileSystemDirectoryHandle)
					maxMtime = Math.max(maxMtime, childMtime)
				} else {
					const file = await (entry as FileSystemFileHandle).getFile()
					maxMtime = Math.max(maxMtime, file.lastModified)
				}
			}
		} catch {
			// Permission denied or handle invalid
		}

		return maxMtime
	}
}

/**
 * Manager for FileSystemObserver integration
 */
export class FileSystemObserverManager {
	/**
	 * Create appropriate strategy based on availability
	 */
	createStrategy(): ObserverStrategy {
		if (this.hasNativeSupport()) {
			return new NativeObserverStrategy()
		}
		return new PollingObserverStrategy()
	}

	/**
	 * Detect FileSystemObserver support
	 */
	hasNativeSupport(): boolean {
		return hasNativeObserver()
	}

	/**
	 * Detect OPFS FileSystemObserver support
	 * Note: This is experimental and may not be widely available
	 */
	hasOPFSSupport(): boolean {
		// For now, assume OPFS support follows native support
		// This can be refined as the API becomes more stable
		return this.hasNativeSupport()
	}
}