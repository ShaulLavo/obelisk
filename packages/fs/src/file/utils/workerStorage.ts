/**
 * Sync OPFS storage using createSyncAccessHandle.
 * No user-space cache - every op hits disk directly.
 * Must run in a Web Worker (sync handles not available on main thread).
 */

declare global {
	interface FileSystemFileHandle {
		createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>
	}
	interface FileSystemSyncAccessHandle {
		read(buffer: ArrayBufferView, options?: { at?: number }): number
		write(buffer: ArrayBufferView, options?: { at?: number }): number
		truncate(size: number): void
		flush(): void
		getSize(): number
		close(): void
	}
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const encodeKey = (key: string): string => {
	const bytes = textEncoder.encode(key)
	let hex = ''
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i]!.toString(16).padStart(2, '0')
	}
	return hex
}

const decodeKey = (hex: string): string => {
	const bytes = new Uint8Array(hex.length / 2)
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
	}
	return textDecoder.decode(bytes)
}

export interface WorkerStorage {
	getItem(key: string): string | null
	getItemAsync(key: string): Promise<string | null>
	setItem(key: string, value: string): void
	setItemAsync(key: string, value: string): Promise<void>
	removeItem(key: string): void
	removeItemAsync(key: string): Promise<void>
	clear(): void
	clearAsync(): Promise<void>
	key(index: number): string | null
	keys(): string[]
	readonly length: number
	close(): void
}

async function createWorkerStorage(): Promise<WorkerStorage> {
	const handles = new Map<string, FileSystemSyncAccessHandle>()
	const filenames = new Set<string>()
	const globalScope = globalThis as typeof globalThis & {
		addEventListener?: (type: string, listener: () => void) => void
	}

	const nav = (globalThis as typeof globalThis & { navigator?: Navigator })
		.navigator
	const storageManager = nav?.storage
	if (!storageManager?.getDirectory) {
		throw new Error(
			'navigator.storage.getDirectory is not available in this context'
		)
	}

	const root = await storageManager.getDirectory()

	const fireAndForget = (promise: Promise<unknown>, context: string): void => {
		promise.catch(() => {})
	}

	type DirectoryWithEntries = FileSystemDirectoryHandle & {
		entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
	}
	const directory = root as DirectoryWithEntries
	const loadInitialKeys = async () => {
		const entries = directory.entries
		if (!entries) return
		try {
			for await (const [name, handle] of entries.call(directory)) {
				if ((handle as FileSystemHandle)?.kind === 'file') {
					filenames.add(name)
				}
			}
		} catch {}
	}

	await loadInitialKeys()

	const closeHandle = (filename: string): void => {
		const handle = handles.get(filename)
		if (handle) {
			try {
				handle.close()
			} catch {}
			handles.delete(filename)
		}
	}

	const isNotFoundError = (error: unknown): boolean => {
		return error instanceof DOMException
			? error.name === 'NotFoundError'
			: false
	}

	const openHandle = async (
		filename: string,
		options: { create: boolean }
	): Promise<FileSystemSyncAccessHandle | null> => {
		const existing = handles.get(filename)
		if (existing) return existing

		try {
			const fileHandle = await root.getFileHandle(filename, {
				create: options.create,
			})
			const syncHandle = await fileHandle.createSyncAccessHandle()
			handles.set(filename, syncHandle)
			filenames.add(filename)
			return syncHandle
		} catch (error) {
			if (!options.create && isNotFoundError(error)) return null
			throw error
		}
	}

	const readFromHandle = (
		handle: FileSystemSyncAccessHandle
	): string | null => {
		const size = handle.getSize()
		if (size === 0) return null
		const buffer = new Uint8Array(size)
		handle.read(buffer, { at: 0 })
		try {
			return JSON.parse(textDecoder.decode(buffer))
		} catch {
			return null
		}
	}

	const writeToHandle = (
		handle: FileSystemSyncAccessHandle,
		value: string
	): void => {
		const data = textEncoder.encode(JSON.stringify(value))
		handle.truncate(0)
		handle.write(data, { at: 0 })
		handle.flush()
	}

	const readValue = async (filename: string): Promise<string | null> => {
		const handle = await openHandle(filename, { create: false })
		if (!handle) return null
		return readFromHandle(handle)
	}

	const writeValue = async (filename: string, value: string): Promise<void> => {
		const handle = await openHandle(filename, { create: true })
		if (!handle) return
		writeToHandle(handle, value)
	}

	const deleteFile = async (filename: string): Promise<void> => {
		closeHandle(filename)
		try {
			await root.removeEntry(filename)
		} catch (error) {
			if (!isNotFoundError(error)) throw error
		} finally {
			filenames.delete(filename)
		}
	}

	const clearFiles = async (): Promise<void> => {
		for (const filename of Array.from(filenames)) {
			await deleteFile(filename)
		}
	}

	const storage: WorkerStorage = {
		getItem(key: string): string | null {
			const filename = encodeKey(key)
			const handle = handles.get(filename)
			if (handle) {
				return readFromHandle(handle)
			}
			fireAndForget(
				storage.getItemAsync(key),
				`Failed to warm handle for key ${key}`
			)
			return null
		},

		async getItemAsync(key: string): Promise<string | null> {
			const filename = encodeKey(key)
			return readValue(filename)
		},

		setItem(key: string, value: string): void {
			const filename = encodeKey(key)
			const handle = handles.get(filename)
			if (handle) {
				writeToHandle(handle, value)
				return
			}
			fireAndForget(
				storage.setItemAsync(key, value),
				`Failed to persist key ${key} synchronously`
			)
		},

		async setItemAsync(key: string, value: string): Promise<void> {
			const filename = encodeKey(key)
			await writeValue(filename, value)
		},

		removeItem(key: string): void {
			fireAndForget(deleteFile(encodeKey(key)), `Failed to remove key ${key}`)
		},

		removeItemAsync(key: string): Promise<void> {
			return deleteFile(encodeKey(key))
		},

		clear(): void {
			fireAndForget(
				storage.clearAsync(),
				'Failed to clear storage synchronously'
			)
		},

		clearAsync(): Promise<void> {
			return clearFiles()
		},

		key(index: number): string | null {
			const keys = Array.from(filenames)
			if (index >= keys.length) return null
			try {
				return decodeKey(keys[index]!)
			} catch {
				return null
			}
		},

		keys(): string[] {
			const result: string[] = []
			for (const filename of filenames) {
				try {
					result.push(decodeKey(filename))
				} catch {}
			}
			return result
		},

		get length(): number {
			return filenames.size
		},

		close(): void {
			for (const handle of handles.values()) {
				try {
					handle.close()
				} catch {}
			}
			handles.clear()
		},
	}

	globalScope.addEventListener?.('unload', () => {
		storage.close()
	})

	return storage
}

/**
 * Async-friendly sync storage for benchmarks.
 * Each op opens handle, does sync I/O, closes handle.
 * Pure disk speed, no caching.
 */
export async function createSyncStore(storeName: string = 'sync-store') {
	const root = await navigator.storage.getDirectory()
	const fileHandle = await root.getFileHandle(`${storeName}.json`, {
		create: true,
	})
	const handle = await fileHandle.createSyncAccessHandle()

	let data: Record<string, unknown> = {}
	let dirty = false

	const load = () => {
		const size = handle.getSize()
		if (size === 0) {
			data = {}
			return
		}
		const buffer = new Uint8Array(size)
		handle.read(buffer, { at: 0 })
		try {
			data = JSON.parse(textDecoder.decode(buffer))
		} catch {
			data = {}
		}
	}

	const flush = () => {
		if (!dirty) return
		const encoded = textEncoder.encode(JSON.stringify(data))
		handle.truncate(0)
		handle.write(encoded, { at: 0 })
		handle.flush()
		dirty = false
	}

	load()

	return {
		async getItem<T>(key: string): Promise<T | null> {
			const value = data[key]
			return value === undefined ? null : (value as T)
		},

		async setItem<T>(key: string, value: T): Promise<T> {
			data[key] = value
			dirty = true
			return value
		},

		async removeItem(key: string): Promise<void> {
			if (!(key in data)) return
			delete data[key]
			dirty = true
		},

		async clear(): Promise<void> {
			data = {}
			dirty = true
		},

		async keys(): Promise<string[]> {
			return Object.keys(data)
		},

		async flush(): Promise<void> {
			flush()
		},

		async close(): Promise<void> {
			flush()
			try {
				handle.close()
			} catch {}
		},
	}
}

export { createWorkerStorage }
