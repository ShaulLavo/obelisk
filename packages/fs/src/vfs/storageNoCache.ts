import type {
	CreateVfsStorageOptions,
	VfsStorage,
	VfsStorageSource
} from './storage'
import type { FsContext } from './types'

const DEFAULT_STORAGE_FILE = '.vfs-store.json'

const isFsContext = (value: unknown): value is FsContext => {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as FsContext).file === 'function' &&
		typeof (value as FsContext).dir === 'function'
	)
}

const readData = async (
	fileHandlePromise: Promise<FileSystemFileHandle>
): Promise<Record<string, unknown>> => {
	const handle = await fileHandlePromise
	try {
		const file = await handle.getFile()
		const text = await file.text()
		return text ? (JSON.parse(text) as Record<string, unknown>) : {}
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			(error instanceof DOMException && error.name === 'NotFoundError')
		) {
			return {}
		}
		throw error
	}
}

const writeData = async (
	fileHandlePromise: Promise<FileSystemFileHandle>,
	data: Record<string, unknown>
): Promise<void> => {
	const handle = await fileHandlePromise
	const writable = await handle.createWritable()
	await writable.write(JSON.stringify(data))
	await writable.close()
}

/**
 * Cache-less storage: every operation reads and writes directly to disk.
 * Useful for benchmarks that want to observe raw OPFS latency without
 * in-memory maps or batched flushes.
 */
export function createStorageNoCache(
	source: VfsStorageSource,
	options?: CreateVfsStorageOptions
): VfsStorage {
	const filePath = options?.filePath ?? DEFAULT_STORAGE_FILE

	const filePromise = isFsContext(source)
		? source.getFileHandleForRelative(filePath, true)
		: source.getFileHandle(filePath, { create: true })

	const getData = () => readData(filePromise)
	const persist = (data: Record<string, unknown>) => writeData(filePromise, data)

	return {
		async getItem<T>(key: string): Promise<T | null> {
			const data = await getData()
			const value = data[key]
			return value === undefined ? null : (value as T)
		},

		async setItem<T>(key: string, value: T): Promise<T> {
			const data = await getData()
			data[key] = value
			await persist(data)
			return value
		},

		async removeItem(key: string): Promise<void> {
			const data = await getData()
			if (!(key in data)) return
			delete data[key]
			await persist(data)
		},

		async clear(): Promise<void> {
			await persist({})
		},

		async length(): Promise<number> {
			const data = await getData()
			return Object.keys(data).length
		},

		async key(index: number): Promise<string | null> {
			const data = await getData()
			const keys = Object.keys(data)
			return index < keys.length ? keys[index]! : null
		},

		async keys(): Promise<string[]> {
			const data = await getData()
			return Object.keys(data)
		},

		async iterate<T, U>(
			iteratee: (value: T, key: string, iterationNumber: number) => U | Promise<U>
		): Promise<U | undefined> {
			const data = await getData()
			let i = 1
			for (const [key, value] of Object.entries(data)) {
				const result = await iteratee(value as T, key, i++)
				if (result !== undefined) {
					return result
				}
			}
			return undefined
		},

		async flush(): Promise<void> {
			// No-op: writes happen immediately
		}
	}
}
