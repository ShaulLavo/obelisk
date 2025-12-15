/**
 * FileSystemObserver polyfill
 *
 * Uses the native FileSystemObserver API when available (Chrome 129+),
 * falls back to polling for cross-browser compatibility.
 */

export type FileSystemChangeType =
	| 'appeared'
	| 'disappeared'
	| 'modified'
	| 'moved'
	| 'unknown'
	| 'errored'

export interface FileSystemChangeRecord {
	/** The root handle being observed */
	readonly root: FileSystemHandle
	/** The handle that changed */
	readonly changedHandle: FileSystemHandle
	/** Path components relative to the root */
	readonly relativePathComponents: readonly string[]
	/** Type of change */
	readonly type: FileSystemChangeType
	/** For 'moved' events, the previous path components */
	readonly relativePathMovedFrom?: readonly string[]
}

export type FileSystemObserverCallback = (
	records: FileSystemChangeRecord[],
	observer: FileSystemObserverPolyfill
) => void

export interface FileSystemObserverOptions {
	/** Whether to observe recursively into subdirectories */
	recursive?: boolean
}

interface FileSnapshot {
	kind: 'file' | 'directory'
	lastModified?: number
	size?: number
	children?: Map<string, FileSnapshot>
}

interface NativeFileSystemObserver {
	observe(
		handle: FileSystemHandle,
		options?: FileSystemObserverOptions
	): Promise<void>
	unobserve(handle: FileSystemHandle): void
	disconnect(): void
}

interface NativeFileSystemObserverConstructor {
	new (callback: FileSystemObserverCallback): NativeFileSystemObserver
}

declare global {
	interface Window {
		FileSystemObserver?: NativeFileSystemObserverConstructor
	}

	interface FileSystemDirectoryHandle {
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>
	}
}

/** Check if native FileSystemObserver is available */
export function hasNativeObserver(): boolean {
	return (
		typeof globalThis !== 'undefined' &&
		typeof (
			globalThis as typeof globalThis & {
				FileSystemObserver?: NativeFileSystemObserverConstructor
			}
		).FileSystemObserver === 'function'
	)
}

/**
 * FileSystemObserver polyfill that provides a consistent API
 * across browsers. Uses native API when available, falls back to polling.
 */
export class FileSystemObserverPolyfill {
	private callback: FileSystemObserverCallback
	private nativeObserver: NativeFileSystemObserver | null = null
	private pollingIntervals: Map<
		FileSystemHandle,
		ReturnType<typeof setInterval>
	> = new Map()
	private pollingInFlight: Set<FileSystemHandle> = new Set()
	private snapshots: Map<FileSystemHandle, FileSnapshot> = new Map()
	private observedOptions: Map<FileSystemHandle, FileSystemObserverOptions> =
		new Map()
	private pollIntervalMs: number

	/** Whether the native FileSystemObserver API is being used */
	readonly isNative: boolean

	constructor(callback: FileSystemObserverCallback, pollIntervalMs = 1000) {
		this.callback = callback
		this.pollIntervalMs = pollIntervalMs
		this.isNative = hasNativeObserver()

		const global = globalThis as typeof globalThis & {
			FileSystemObserver?: NativeFileSystemObserverConstructor
		}
		if (this.isNative && global.FileSystemObserver) {
			this.nativeObserver = new global.FileSystemObserver(
				(records, _observer) => {
					// Wrap the native callback to use our observer instance
					this.callback(records as FileSystemChangeRecord[], this)
				}
			)
		}
	}

	/**
	 * Start observing a file or directory handle for changes
	 */
	async observe(
		handle: FileSystemHandle,
		options: FileSystemObserverOptions = {}
	): Promise<void> {
		if (this.nativeObserver) {
			return this.nativeObserver.observe(handle, options)
		}

		// Polling fallback
		if (this.pollingIntervals.has(handle)) {
			// Already observing this handle
			return
		}

		this.observedOptions.set(handle, options)

		// Take initial snapshot
		const snapshot = await this.takeSnapshot(handle, options.recursive ?? false)
		this.snapshots.set(handle, snapshot)

		// Start polling
		const intervalId = setInterval(async () => {
			if (this.pollingInFlight.has(handle)) return
			this.pollingInFlight.add(handle)
			try {
				await this.checkForChanges(handle)
			} catch (error) {
				// Handle was likely removed or permission revoked
				const record: FileSystemChangeRecord = {
					root: handle,
					changedHandle: handle,
					relativePathComponents: [],
					type: 'errored',
				}
				this.callback([record], this)
			} finally {
				this.pollingInFlight.delete(handle)
			}
		}, this.pollIntervalMs)

		this.pollingIntervals.set(handle, intervalId)
	}

	/**
	 * Stop observing a specific handle
	 */
	unobserve(handle: FileSystemHandle): void {
		if (this.nativeObserver) {
			this.nativeObserver.unobserve(handle)
			return
		}

		const intervalId = this.pollingIntervals.get(handle)
		if (intervalId !== undefined) {
			clearInterval(intervalId)
			this.pollingIntervals.delete(handle)
		}
		this.snapshots.delete(handle)
		this.observedOptions.delete(handle)
	}

	/**
	 * Stop all observations and clean up
	 */
	disconnect(): void {
		if (this.nativeObserver) {
			this.nativeObserver.disconnect()
			return
		}

		for (const intervalId of this.pollingIntervals.values()) {
			clearInterval(intervalId)
		}
		this.pollingIntervals.clear()
		this.snapshots.clear()
		this.observedOptions.clear()
	}

	private async takeSnapshot(
		handle: FileSystemHandle,
		recursive: boolean
	): Promise<FileSnapshot> {
		if (handle.kind === 'file') {
			const fileHandle = handle as FileSystemFileHandle
			try {
				const file = await fileHandle.getFile()
				return {
					kind: 'file',
					lastModified: file.lastModified,
					size: file.size,
				}
			} catch {
				return { kind: 'file' }
			}
		}

		const dirHandle = handle as FileSystemDirectoryHandle
		const children = new Map<string, FileSnapshot>()

		try {
			for await (const [name, childHandle] of dirHandle.entries()) {
				if (recursive || childHandle.kind === 'file') {
					children.set(
						name,
						await this.takeSnapshot(
							childHandle,
							recursive && childHandle.kind === 'directory'
						)
					)
				} else {
					// For non-recursive, just record directory existence
					children.set(name, { kind: 'directory' })
				}
			}
		} catch {
			// Permission denied or handle invalid
		}

		return { kind: 'directory', children }
	}

	private async checkForChanges(rootHandle: FileSystemHandle): Promise<void> {
		const options = this.observedOptions.get(rootHandle)
		const recursive = options?.recursive ?? false
		const oldSnapshot = this.snapshots.get(rootHandle)

		if (!oldSnapshot) return

		const newSnapshot = await this.takeSnapshot(rootHandle, recursive)
		const changes: FileSystemChangeRecord[] = []

		this.diffSnapshots(
			rootHandle,
			rootHandle,
			[],
			oldSnapshot,
			newSnapshot,
			changes,
			recursive
		)

		this.snapshots.set(rootHandle, newSnapshot)

		if (changes.length > 0) {
			this.callback(changes, this)
		}
	}

	private diffSnapshots(
		rootHandle: FileSystemHandle,
		currentHandle: FileSystemHandle,
		pathComponents: string[],
		oldSnap: FileSnapshot,
		newSnap: FileSnapshot,
		changes: FileSystemChangeRecord[],
		recursive: boolean
	): void {
		// Check for file modifications
		if (oldSnap.kind === 'file' && newSnap.kind === 'file') {
			if (
				oldSnap.lastModified !== newSnap.lastModified ||
				oldSnap.size !== newSnap.size
			) {
				changes.push({
					root: rootHandle,
					changedHandle: currentHandle,
					relativePathComponents: pathComponents,
					type: 'modified',
				})
			}
			return
		}

		// Check directory children
		if (oldSnap.kind === 'directory' && newSnap.kind === 'directory') {
			const oldChildren = oldSnap.children ?? new Map()
			const newChildren = newSnap.children ?? new Map()

			// Check for disappeared items
			for (const [name, oldChild] of oldChildren) {
				if (!newChildren.has(name)) {
					changes.push({
						root: rootHandle,
						changedHandle: currentHandle, // Best approximation
						relativePathComponents: [...pathComponents, name],
						type: 'disappeared',
					})
				}
			}

			// Check for appeared and modified items
			for (const [name, newChild] of newChildren) {
				const oldChild = oldChildren.get(name)
				const childPath = [...pathComponents, name]

				if (!oldChild) {
					changes.push({
						root: rootHandle,
						changedHandle: currentHandle, // Best approximation
						relativePathComponents: childPath,
						type: 'appeared',
					})
				} else if (recursive || newChild.kind === 'file') {
					// Recursively diff
					this.diffSnapshots(
						rootHandle,
						currentHandle,
						childPath,
						oldChild,
						newChild,
						changes,
						recursive
					)
				}
			}
		}

		// Kind changed (e.g., file replaced by directory)
		if (oldSnap.kind !== newSnap.kind) {
			changes.push({
				root: rootHandle,
				changedHandle: currentHandle,
				relativePathComponents: pathComponents,
				type: 'disappeared',
			})
			changes.push({
				root: rootHandle,
				changedHandle: currentHandle,
				relativePathComponents: pathComponents,
				type: 'appeared',
			})
		}
	}
}

/**
 * Factory function to create a FileSystemObserver with the best available implementation
 */
export function createFileSystemObserver(
	callback: FileSystemObserverCallback,
	pollIntervalMs?: number
): FileSystemObserverPolyfill {
	return new FileSystemObserverPolyfill(callback, pollIntervalMs)
}
