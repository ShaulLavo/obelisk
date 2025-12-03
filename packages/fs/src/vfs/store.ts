import type { FsContext, FsContextOptions } from './types'
import { sanitizePath } from './utils/path'
import { VFile } from './vfile'
import { createFs } from './fsContext'
import { textEncoder } from './utils/streams'

const DEFAULT_STORE_INDEX_PATH = '.vfs-store/store.meta.json'
const STORE_DATA_SUFFIX = '.data'
const textDecoder = new TextDecoder()

type ItemPointer = {
	start: number
	length: number
}

function isFsContext(value: unknown): value is FsContext {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as FsContext).file === 'function' &&
		typeof (value as FsContext).dir === 'function'
	)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface VfsStore {
	getItem<T>(key: string): Promise<T | null>
	setItem<T>(key: string, value: T): Promise<T>
	removeItem(key: string): Promise<void>
	clear(): Promise<void>
	length(): Promise<number>
	key(index: number): Promise<string | null>
	keys(): Promise<string[]>
	iterate<T, U>(
		iteratee: (
			value: T,
			key: string,
			iterationNumber: number
		) => U | Promise<U>
	): Promise<U | undefined>
}

export interface CreateVfsStoreOptions {
	filePath?: string
	fsOptions?: FsContextOptions
}

class VfsStoreImpl implements VfsStore {
	#indexFile: VFile
	#dataFile: VFile
	#indexCache: Map<string, ItemPointer> | null = null
	#loadingIndex: Promise<Map<string, ItemPointer>> | null = null
	#queue: Promise<void> = Promise.resolve()

	constructor(indexFile: VFile, dataFile: VFile) {
		this.#indexFile = indexFile
		this.#dataFile = dataFile
	}

	async getItem<T>(key: string): Promise<T | null> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			const pointer = index.get(key)
			if (!pointer) return null
			return (await this.#readValueAt(pointer)) as T
		})
	}

	async setItem<T>(key: string, value: T): Promise<T> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			const normalized = value === undefined ? null : (value as unknown)
			const pointer = await this.#appendValue(normalized)
			index.set(key, pointer)
			await this.#persistIndex(index)
			return value
		})
	}

	async removeItem(key: string): Promise<void> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			if (!index.delete(key)) return
			await this.#rewriteDataFile(index)
		})
	}

	async clear(): Promise<void> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			if (index.size === 0) return
			index.clear()
			await this.#dataFile.write('', { truncate: true })
			await this.#persistIndex(index)
		})
	}

	async length(): Promise<number> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			return index.size
		})
	}

	async key(index: number): Promise<string | null> {
		return this.#enqueue(async () => {
			const map = await this.#ensureIndex()
			let current = 0
			for (const key of map.keys()) {
				if (current === index) return key
				current += 1
			}
			return null
		})
	}

	async keys(): Promise<string[]> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			return Array.from(index.keys())
		})
	}

	async iterate<T, U>(
		iteratee: (
			value: T,
			key: string,
			iterationNumber: number
		) => U | Promise<U>
	): Promise<U | undefined> {
		return this.#enqueue(async () => {
			const index = await this.#ensureIndex()
			let iterationNumber = 1
			for (const [key, pointer] of index.entries()) {
				const value = (await this.#readValueAt(pointer)) as T
				const result = await iteratee(value, key, iterationNumber++)
				if (result !== undefined) {
					return result
				}
			}
			return undefined
		})
	}

	#enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.#queue.then(() => operation())
		this.#queue = run.then(
			() => undefined,
			() => undefined
		)
		return run
	}

	async #ensureIndex(): Promise<Map<string, ItemPointer>> {
		if (this.#indexCache) return this.#indexCache
		if (this.#loadingIndex) return this.#loadingIndex
		this.#loadingIndex = this.#readIndexFromDisk()
			.then(index => {
				this.#indexCache = index
				return index
			})
			.finally(() => {
				this.#loadingIndex = null
			})
		return this.#loadingIndex
	}

	async #readIndexFromDisk(): Promise<Map<string, ItemPointer>> {
		const exists = await this.#indexFile.exists()
		if (!exists) {
			return new Map()
		}

		const text = await this.#indexFile.text()
		if (text.trim() === '') {
			return new Map()
		}

		let parsed: unknown
		try {
			parsed = JSON.parse(text)
		} catch (error) {
			throw new Error(
				`Failed to parse store index from "${this.#indexFile.path}": ${error instanceof Error ? error.message : String(error)}`
			)
		}

		if (!isPlainRecord(parsed)) {
			throw new Error(
				`Store index file "${this.#indexFile.path}" must contain a JSON object with string keys`
			)
		}

		const entries: Array<[string, ItemPointer]> = []
		for (const [key, value] of Object.entries(parsed)) {
			if (
				!isPlainRecord(value) ||
				typeof value.start !== 'number' ||
				typeof value.length !== 'number'
			) {
				throw new Error(
					`Invalid pointer for key "${key}" in store index "${this.#indexFile.path}"`
				)
			}
			entries.push([key, { start: value.start, length: value.length }])
		}

		return new Map(entries)
	}

	async #persistIndex(index: Map<string, ItemPointer>): Promise<void> {
		const payload: Record<string, ItemPointer> = {}
		for (const [key, pointer] of index.entries()) {
			payload[key] = { start: pointer.start, length: pointer.length }
		}
		await this.#indexFile.writeJSON(payload, { truncate: true })
		this.#indexCache = index
	}

	async #appendValue(value: unknown): Promise<ItemPointer> {
		const encoded = textEncoder.encode(JSON.stringify(value))
		const start = await this.#getDataFileSize()
		await this.#dataFile.append(encoded)
		return { start, length: encoded.byteLength }
	}

	async #getDataFileSize(): Promise<number> {
		if (!(await this.#dataFile.exists())) {
			return 0
		}
		return this.#dataFile.getSize()
	}

	async #readValueAt(pointer: ItemPointer): Promise<unknown> {
		if (pointer.length === 0) {
			return null
		}

		const reader = await this.#dataFile.createReader()
		try {
			const buffer = await reader.read(pointer.length, {
				at: pointer.start
			})
			const decoded = textDecoder.decode(new Uint8Array(buffer))
			return JSON.parse(decoded)
		} finally {
			await reader.close()
		}
	}

	async #rewriteDataFile(index: Map<string, ItemPointer>): Promise<void> {
		const writer = await this.#dataFile.createWriter()
		const nextIndex = new Map<string, ItemPointer>()
		let offset = 0
		let rewriteSucceeded = false

		try {
			for (const [key, pointer] of index.entries()) {
				const chunk = await this.#readRawBytes(pointer)
				if (chunk.byteLength > 0) {
					await writer.write(chunk as unknown as BufferSource, {
						at: offset
					})
				}
				nextIndex.set(key, { start: offset, length: chunk.byteLength })
				offset += chunk.byteLength
			}

			await writer.truncate(offset)
			// NOTE: Deletion rewrites the whole data file, which is intentionally slow but predictable.
			await writer.flush()
			rewriteSucceeded = true
		} finally {
			await writer.close().catch(error => {
				console.error('Failed to close VFS data file writer', error)
			})
		}

		if (rewriteSucceeded) {
			await this.#persistIndex(nextIndex)
		}
	}

	async #readRawBytes(pointer: ItemPointer): Promise<Uint8Array> {
		if (pointer.length === 0) {
			return new Uint8Array()
		}

		const reader = await this.#dataFile.createReader()
		try {
			const buffer = await reader.read(pointer.length, {
				at: pointer.start
			})
			return new Uint8Array(buffer)
		} finally {
			await reader.close()
		}
	}
}

export type VfsStoreSource = FsContext | FileSystemDirectoryHandle

export function createStore(
	source: VfsStoreSource,
	options?: CreateVfsStoreOptions
): VfsStore {
	const ctx = isFsContext(source)
		? source
		: createFs(source, options?.fsOptions)
	const indexPath = sanitizePath(
		options?.filePath ?? DEFAULT_STORE_INDEX_PATH
	)
	const dataPath = sanitizePath(`${indexPath}${STORE_DATA_SUFFIX}`)
	const indexFile = ctx.file(indexPath, 'rw')
	const dataFile = ctx.file(dataPath, 'rw')
	return new VfsStoreImpl(indexFile, dataFile)
}
