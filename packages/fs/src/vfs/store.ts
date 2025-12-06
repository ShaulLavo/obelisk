import type { FsContext, FsContextOptions } from './types'
import { getParentPath, sanitizePath } from './utils/path'
import { VFile } from './vfile'
import { createFs } from './fsContext'
import { textEncoder } from './utils/streams'
import { randomId } from './utils/random'

const DEFAULT_STORE_INDEX_PATH = '.vfs-store/store.meta.json'
const STORE_DATA_SUFFIX = '.data'
const textDecoder = new TextDecoder()

/** Compact when dead bytes exceed this fraction of total data file size. */
const COMPACTION_RATIO_THRESHOLD = 0.5
/** Minimum dead bytes before compaction is considered (avoid compacting tiny files). */
const COMPACTION_MIN_DEAD_BYTES = 64 * 1024 // 64KB

type ItemPointer = {
	start: number
	length: number
}

type StoreIndexData = {
	entries: Map<string, ItemPointer>
	deadBytes: number
}

type DataSwapGuards = {
	commit: () => Promise<void>
	rollback: () => Promise<void>
}

type MoveCapableFileHandle = FileSystemFileHandle & {
	move?: (
		newParent: FileSystemDirectoryHandle,
		newName?: string
	) => Promise<unknown>
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
		iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
	): Promise<U | undefined>
}

export interface CreateVfsStoreOptions {
	filePath?: string
	fsOptions?: FsContextOptions
}

class VfsStoreImpl implements VfsStore {
	#ctx: FsContext
	#indexFile: VFile
	#dataFile: VFile
	#indexCache: StoreIndexData | null = null
	#loadingIndex: Promise<StoreIndexData> | null = null
	#queue: Promise<void> = Promise.resolve()
	#isRunning = false

	constructor(ctx: FsContext, indexFile: VFile, dataFile: VFile) {
		this.#ctx = ctx
		this.#indexFile = indexFile
		this.#dataFile = dataFile
	}

	async getItem<T>(key: string): Promise<T | null> {
		return this.#enqueue(async () => {
			const { entries } = await this.#ensureIndex()
			const pointer = entries.get(key)
			if (!pointer) return null
			return (await this.#readValueAt(pointer)) as T
		})
	}

	async setItem<T>(key: string, value: T): Promise<T> {
		return this.#enqueue(async () => {
			const indexData = await this.#ensureIndex()
			const normalized = value === undefined ? null : (value as unknown)
			const oldPointer = indexData.entries.get(key)
			const pointer = await this.#appendValue(normalized)
			indexData.entries.set(key, pointer)
			// Track dead bytes from overwritten value
			if (oldPointer) {
				indexData.deadBytes += oldPointer.length
			}
			await this.#persistIndex(indexData)
			await this.#maybeCompact(indexData)
			return value
		})
	}

	async removeItem(key: string): Promise<void> {
		return this.#enqueue(async () => {
			const indexData = await this.#ensureIndex()
			const pointer = indexData.entries.get(key)
			if (!pointer) return
			indexData.entries.delete(key)
			// Track dead bytes instead of rewriting - O(1) deletion
			indexData.deadBytes += pointer.length
			await this.#persistIndex(indexData)
			await this.#maybeCompact(indexData)
		})
	}

	async clear(): Promise<void> {
		return this.#enqueue(async () => {
			const indexData = await this.#ensureIndex()
			if (indexData.entries.size === 0) return
			indexData.entries.clear()
			indexData.deadBytes = 0
			await this.#dataFile.write('', { truncate: true })
			await this.#persistIndex(indexData)
		})
	}

	async length(): Promise<number> {
		return this.#enqueue(async () => {
			const { entries } = await this.#ensureIndex()
			return entries.size
		})
	}

	async key(index: number): Promise<string | null> {
		return this.#enqueue(async () => {
			const { entries } = await this.#ensureIndex()
			let current = 0
			for (const key of entries.keys()) {
				if (current === index) return key
				current += 1
			}
			return null
		})
	}

	async keys(): Promise<string[]> {
		return this.#enqueue(async () => {
			const { entries } = await this.#ensureIndex()
			return Array.from(entries.keys())
		})
	}

	async iterate<T, U>(
		iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
	): Promise<U | undefined> {
		return this.#enqueue(async () => {
			const { entries } = await this.#ensureIndex()
			const entryList = Array.from(entries.entries())
			let iterationNumber = 1
			for (const [key] of entryList) {
				// Refresh pointer so removeItem inside iteratee doesn't leave stale offsets.
				const pointer = entries.get(key)
				if (!pointer) continue
				const value = (await this.#readValueAt(pointer)) as T
				const result = await iteratee(value, key, iterationNumber++)
				if (result !== undefined) {
					return result
				}
			}
			return undefined
		})
	}

	// Serialized but re-entrant queue so nested store calls run inline to avoid deadlocks.
	#enqueue<T>(operation: () => Promise<T>): Promise<T> {
		if (this.#isRunning) {
			return operation()
		}

		const run = this.#queue.then(async () => {
			this.#isRunning = true
			try {
				return await operation()
			} finally {
				this.#isRunning = false
			}
		})

		this.#queue = run.then(
			() => undefined,
			() => undefined
		)

		return run
	}

	async #ensureIndex(): Promise<StoreIndexData> {
		if (this.#indexCache) return this.#indexCache
		if (this.#loadingIndex) return this.#loadingIndex
		this.#loadingIndex = this.#readIndexFromDisk()
			.then(indexData => {
				this.#indexCache = indexData
				return indexData
			})
			.finally(() => {
				this.#loadingIndex = null
			})
		return this.#loadingIndex
	}

	async #readIndexFromDisk(): Promise<StoreIndexData> {
		const exists = await this.#indexFile.exists()
		if (!exists) {
			return { entries: new Map(), deadBytes: 0 }
		}

		const text = await this.#indexFile.text()
		if (text.trim() === '') {
			return { entries: new Map(), deadBytes: 0 }
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
		const entriesObj = isPlainRecord(parsed.entries) ? parsed.entries : parsed
		const deadBytes =
			typeof parsed.deadBytes === 'number' ? parsed.deadBytes : 0

		for (const [key, value] of Object.entries(entriesObj)) {
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

		return { entries: new Map(entries), deadBytes }
	}

	async #persistIndex(indexData: StoreIndexData): Promise<void> {
		const entriesPayload: Record<string, ItemPointer> = {}
		for (const [key, pointer] of indexData.entries.entries()) {
			entriesPayload[key] = { start: pointer.start, length: pointer.length }
		}
		const payload = {
			entries: entriesPayload,
			deadBytes: indexData.deadBytes
		}
		await this.#indexFile.writeJSON(payload, { truncate: true })
		this.#indexCache = indexData
	}

	async #maybeCompact(indexData: StoreIndexData): Promise<void> {
		if (indexData.deadBytes < COMPACTION_MIN_DEAD_BYTES) {
			return
		}
		const totalLiveBytes = Array.from(indexData.entries.values()).reduce(
			(sum, p) => sum + p.length,
			0
		)
		const totalBytes = totalLiveBytes + indexData.deadBytes
		if (
			totalBytes === 0 ||
			indexData.deadBytes / totalBytes < COMPACTION_RATIO_THRESHOLD
		) {
			return
		}
		await this.#compactDataFile(indexData)
	}

	async #compactDataFile(indexData: StoreIndexData): Promise<void> {
		const tempFile = this.#createTempDataFile()
		const writer = await tempFile.createWriter()
		const nextEntries = new Map<string, ItemPointer>()
		const previousEntries = indexData.entries
		const previousDeadBytes = indexData.deadBytes
		let offset = 0
		let writeFailed = false
		let swapGuards: DataSwapGuards | null = null
		let indexUpdated = false

		try {
			for (const [key, pointer] of indexData.entries.entries()) {
				const chunk = await this.#readRawBytes(pointer)
				if (chunk.byteLength > 0) {
					await writer.write(chunk, {
						at: offset
					})
				}
				nextEntries.set(key, { start: offset, length: chunk.byteLength })
				offset += chunk.byteLength
			}

			await writer.truncate(offset)
			await writer.flush()
		} catch (error) {
			writeFailed = true
			throw error
		} finally {
			await writer.close().catch(error => {
				console.error('Failed to close VFS compacted temp file writer', error)
			})
			if (writeFailed) {
				await this.#safeRemoveFile(tempFile)
			}
		}

		try {
			swapGuards = await this.#atomicallySwapDataFile(tempFile)
			indexData.entries = nextEntries
			indexData.deadBytes = 0
			indexUpdated = true
			await this.#persistIndex(indexData)
			await swapGuards.commit()
		} catch (error) {
			if (indexUpdated) {
				indexData.entries = previousEntries
				indexData.deadBytes = previousDeadBytes
			}
			await this.#safeRemoveFile(tempFile)
			if (swapGuards) {
				await swapGuards.rollback()
			} else if (
				error instanceof Error &&
				error.message.includes('Atomic rename is not supported')
			) {
				console.warn(
					'VFS data compaction skipped: underlying filesystem does not support atomic rename operations'
				)
				return
			}
			throw error
		}
	}

	#createTempDataFile(): VFile {
		const parentDir = this.#dataFile.parent ?? this.#ctx.dir('')
		const tempName = `${this.#dataFile.name}.${randomId()}.tmp`
		return parentDir.getFile(tempName, 'rw')
	}

	async #safeRemoveFile(file: VFile): Promise<void> {
		try {
			await file.remove({ force: true })
		} catch {
			// best-effort cleanup
		}
	}

	#splitPath(path: string): { dir: string; name: string } {
		const sanitized = sanitizePath(path)
		const segments = sanitized ? sanitized.split('/') : []
		if (segments.length === 0) {
			throw new Error('File path cannot be empty')
		}
		const name = segments[segments.length - 1]!
		const dir = getParentPath(segments) ?? ''
		return { dir, name }
	}

	async #moveHandle(
		handle: FileSystemFileHandle,
		parent: FileSystemDirectoryHandle,
		name: string
	): Promise<void> {
		const candidate = handle as MoveCapableFileHandle
		if (typeof candidate.move !== 'function') {
			throw new Error('Atomic rename is not supported by this filesystem')
		}
		await candidate.move.call(handle, parent, name)
	}

	async #atomicallySwapDataFile(tempFile: VFile): Promise<DataSwapGuards> {
		const { dir: destDirPath, name: destName } = this.#splitPath(
			this.#dataFile.path
		)
		const destDirHandle = await this.#ctx.getDirectoryHandleForRelative(
			destDirPath,
			true
		)
		const tempHandle = await this.#ctx.getFileHandleForRelative(
			tempFile.path,
			false
		)
		const dataExists = await this.#dataFile.exists()
		let backupName: string | null = null

		if (dataExists) {
			backupName = `${destName}.bak-${randomId()}`
			const currentHandle = await this.#ctx.getFileHandleForRelative(
				this.#dataFile.path,
				false
			)
			await this.#moveHandle(currentHandle, destDirHandle, backupName)
		}

		try {
			await this.#moveHandle(tempHandle, destDirHandle, destName)
		} catch (error) {
			if (backupName) {
				await this.#restoreBackup(destDirHandle, backupName, destName)
			}
			throw error
		}

		return {
			commit: async () => {
				if (!backupName) {
					return
				}
				try {
					await destDirHandle.removeEntry(backupName)
				} catch (error) {
					console.error('Failed to remove VFS data file backup', error)
				}
			},
			rollback: async () => {
				try {
					await destDirHandle.removeEntry(destName)
				} catch {
					// ignore best-effort removal
				}
				if (backupName) {
					await this.#restoreBackup(destDirHandle, backupName, destName)
				}
			}
		}
	}

	async #restoreBackup(
		parentHandle: FileSystemDirectoryHandle,
		backupName: string,
		originalName: string
	): Promise<void> {
		try {
			const backupHandle = await parentHandle.getFileHandle(backupName, {
				create: false
			})
			await this.#moveHandle(backupHandle, parentHandle, originalName)
		} catch (error) {
			console.error('Failed to restore VFS data file from backup', error)
		}
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

	async #readRawBytes(pointer: ItemPointer): Promise<Uint8Array<ArrayBuffer>> {
		if (pointer.length === 0) {
			return new Uint8Array(new ArrayBuffer(0))
		}

		const reader = await this.#dataFile.createReader()
		try {
			const buffer = (await reader.read(pointer.length, {
				at: pointer.start
			})) as ArrayBuffer
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
	const indexPath = sanitizePath(options?.filePath ?? DEFAULT_STORE_INDEX_PATH)
	const dataPath = sanitizePath(`${indexPath}${STORE_DATA_SUFFIX}`)
	const indexFile = ctx.file(indexPath, 'rw')
	const dataFile = ctx.file(dataPath, 'rw')
	return new VfsStoreImpl(ctx, indexFile, dataFile)
}
