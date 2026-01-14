import type { RootCtx } from './types'

const DEFAULT_STORAGE_FILE = '.vfs-store.json'
const FLUSH_DELAY_MS = 50

function isRootCtx(value: unknown): value is RootCtx {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as RootCtx).file === 'function' &&
		typeof (value as RootCtx).dir === 'function'
	)
}

export interface Storage {
	getItem<T>(key: string): Promise<T | null>
	getItemSync<T>(key: string): T | null
	setItem<T>(key: string, value: T): Promise<T>
	removeItem(key: string): Promise<void>
	clear(): Promise<void>
	length(): Promise<number>
	key(index: number): Promise<string | null>
	keys(): Promise<string[]>
	keysSync(): string[]
	iterate<T, U>(
		iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
	): Promise<U | undefined>
	flush(): Promise<void>
	readonly ready: boolean
	whenReady(): Promise<void>
}

export interface CreateStorageOptions {
	filePath?: string
	flushDelay?: number
}

type StorageData = Record<string, unknown>

class StorageImpl implements Storage {
	#fileHandle: Promise<FileSystemFileHandle>
	#data: StorageData = {}
	#ready = false
	#dirty = false
	#flushTimer: ReturnType<typeof setTimeout> | null = null
	#flushDelay: number
	#flushPromise: Promise<void> | null = null
	#readyPromise: Promise<void>

	constructor(
		fileHandlePromise: Promise<FileSystemFileHandle>,
		flushDelay: number
	) {
		this.#fileHandle = fileHandlePromise
		this.#flushDelay = flushDelay
		this.#readyPromise = this.#hydrate()
	}

	get ready(): boolean {
		return this.#ready
	}

	whenReady(): Promise<void> {
		return this.#readyPromise
	}

	async #hydrate(): Promise<void> {
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
		this.#ready = true
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
		this.#flushPromise?.catch(() => {})
	}

	async #doFlush(): Promise<void> {
		if (!this.#dirty) {
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

	getItemSync<T>(key: string): T | null {
		const value = this.#data[key]
		return value === undefined ? null : (value as T)
	}

	async getItem<T>(key: string): Promise<T | null> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		return this.getItemSync(key)
	}

	async setItem<T>(key: string, value: T): Promise<T> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		this.#data[key] = value
		this.#dirty = true
		this.#scheduleFlush()
		return value
	}

	async removeItem(key: string): Promise<void> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		if (!(key in this.#data)) return
		delete this.#data[key]
		this.#dirty = true
		this.#scheduleFlush()
	}

	async clear(): Promise<void> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		this.#data = {}
		this.#dirty = true
		this.#scheduleFlush()
	}

	async length(): Promise<number> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		return Object.keys(this.#data).length
	}

	async key(index: number): Promise<string | null> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		const keys = Object.keys(this.#data)
		return index < keys.length ? keys[index]! : null
	}

	keysSync(): string[] {
		return Object.keys(this.#data)
	}

	async keys(): Promise<string[]> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		return this.keysSync()
	}

	async iterate<T, U>(
		iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
	): Promise<U | undefined> {
		if (!this.#ready) {
			await this.#readyPromise
		}
		let i = 1
		for (const [key, value] of Object.entries(this.#data)) {
			const result = await iteratee(value as T, key, i++)
			if (result !== undefined) {
				return result
			}
		}
		return undefined
	}
}

export type StorageSource = RootCtx | FileSystemDirectoryHandle

export function createStorage(
	source: StorageSource,
	options?: CreateStorageOptions
): Storage {
	const filePath = options?.filePath ?? DEFAULT_STORAGE_FILE
	const flushDelay = options?.flushDelay ?? FLUSH_DELAY_MS

	let filePromise: Promise<FileSystemFileHandle>

	if (isRootCtx(source)) {
		filePromise = source.getFileHandleForRelative(filePath, true)
	} else {
		filePromise = source.getFileHandle(filePath, { create: true })
	}

	return new StorageImpl(filePromise, flushDelay)
}
