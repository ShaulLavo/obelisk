import type { FsContext } from './types'

const DEFAULT_STORAGE_FILE = '.vfs-store.json'
const FLUSH_DELAY_MS = 50

function isFsContext(value: unknown): value is FsContext {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as FsContext).file === 'function' &&
		typeof (value as FsContext).dir === 'function'
	)
}

export interface VfsStorage {
	getItem<T>(key: string): Promise<T | null>
	setItem<T>(key: string, value: T): Promise<T>
	removeItem(key: string): Promise<void>
	clear(): Promise<void>
	length(): Promise<number>
	key(index: number): Promise<string | null>
	keys(): Promise<string[]>
	iterate<T, U>(
		iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
	): Promise<U | undefined>
	/** Force immediate write to disk */
	flush(): Promise<void>
}

export interface CreateVfsStorageOptions {
	filePath?: string
	/** Delay before flushing changes to disk (ms). Default: 50 */
	flushDelay?: number
}

type StorageData = Record<string, unknown>

/**
 * Fast single-file storage with in-memory cache and batched writes.
 *
 * - All reads from memory (instant)
 * - Writes batch into single file operation
 * - Great for small/medium values; for huge blobs, consider IndexedDB
 */
class VfsStorageImpl implements VfsStorage {
	#fileHandle: Promise<FileSystemFileHandle>
	#data: StorageData | null = null
	#dirty = false
	#flushTimer: ReturnType<typeof setTimeout> | null = null
	#flushDelay: number
	#flushPromise: Promise<void> | null = null
	#initPromise: Promise<void> | null = null

	constructor(
		fileHandlePromise: Promise<FileSystemFileHandle>,
		flushDelay: number
	) {
		this.#fileHandle = fileHandlePromise
		this.#flushDelay = flushDelay
	}

	async #init(): Promise<void> {
		if (this.#data !== null) return
		if (this.#initPromise) return this.#initPromise

		this.#initPromise = (async () => {
			const handle = await this.#fileHandle
			try {
				const file = await handle.getFile()
				const text = await file.text()
				this.#data = text ? (JSON.parse(text) as StorageData) : {}
			} catch (error) {
				if (
					error instanceof SyntaxError ||
					(error instanceof DOMException && error.name === 'NotFoundError')
				) {
					this.#data = {}
				} else {
					throw error
				}
			}
		})()

		await this.#initPromise
	}

	#scheduleFlush(): void {
		if (this.#flushDelay === 0) {
			if (!this.#flushPromise) {
				this.#flushPromise = Promise.resolve().then(() => this.#doFlush())
				this.#markFlushHandled()
			}
			return
		}

		if (this.#flushTimer !== null) return

		this.#flushTimer = setTimeout(() => {
			this.#flushTimer = null
			this.#flushPromise = this.#doFlush()
			this.#markFlushHandled()
		}, this.#flushDelay)
	}
	#markFlushHandled(): void {
		this.#flushPromise?.catch(() => {
			// Avoid unhandled rejections from scheduled flushes; `flush()` callers still see errors
		})
	}

	async #doFlush(): Promise<void> {
		if (!this.#dirty || this.#data === null) {
			this.#flushPromise = null
			return
		}

		let hadError = false
		this.#dirty = false
		const content = JSON.stringify(this.#data)

		try {
			const handle = await this.#fileHandle
			const writable = await handle.createWritable()
			await writable.write(content)
			await writable.close()
		} catch (error) {
			hadError = true
			this.#dirty = true
			throw error
		} finally {
			this.#flushPromise = null

			if (!hadError && this.#dirty) {
				this.#scheduleFlush()
			}
		}
	}

	async flush(): Promise<void> {
		if (this.#flushTimer !== null) {
			clearTimeout(this.#flushTimer)
			this.#flushTimer = null
		}

		if (this.#flushPromise) {
			await this.#flushPromise
		}

		if (this.#dirty) {
			await this.#doFlush()
		}
	}

	async getItem<T>(key: string): Promise<T | null> {
		await this.#init()
		const value = this.#data![key]
		return value === undefined ? null : (value as T)
	}

	async setItem<T>(key: string, value: T): Promise<T> {
		await this.#init()
		this.#data![key] = value
		this.#dirty = true
		this.#scheduleFlush()
		return value
	}

	async removeItem(key: string): Promise<void> {
		await this.#init()
		if (!(key in this.#data!)) return
		delete this.#data![key]
		this.#dirty = true
		this.#scheduleFlush()
	}

	async clear(): Promise<void> {
		await this.#init()
		this.#data = {}
		this.#dirty = true
		this.#scheduleFlush()
	}

	async length(): Promise<number> {
		await this.#init()
		return Object.keys(this.#data!).length
	}

	async key(index: number): Promise<string | null> {
		await this.#init()
		const keys = Object.keys(this.#data!)
		return index < keys.length ? keys[index]! : null
	}

	async keys(): Promise<string[]> {
		await this.#init()
		return Object.keys(this.#data!)
	}

	async iterate<T, U>(
		iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
	): Promise<U | undefined> {
		await this.#init()
		let i = 1
		for (const [key, value] of Object.entries(this.#data!)) {
			const result = await iteratee(value as T, key, i++)
			if (result !== undefined) {
				return result
			}
		}
		return undefined
	}
}

	export type VfsStorageSource = FsContext | FileSystemDirectoryHandle

export function createStorage(
	source: VfsStorageSource,
	options?: CreateVfsStorageOptions
): VfsStorage {
	const filePath = options?.filePath ?? DEFAULT_STORAGE_FILE
	const flushDelay = options?.flushDelay ?? FLUSH_DELAY_MS

	let filePromise: Promise<FileSystemFileHandle>

	if (isFsContext(source)) {
		filePromise = source.getFileHandleForRelative(filePath, true)
	} else {
		filePromise = source.getFileHandle(filePath, { create: true })
	}

	return new VfsStorageImpl(filePromise, flushDelay)
}
