import type {
	CreateStorageOptions,
	Storage,
	StorageSource,
} from './storage'
import type { RootCtx } from './types'

const DEFAULT_STORAGE_FILE = '.vfs-store.json'

const isRootCtx = (value: unknown): value is RootCtx => {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as RootCtx).file === 'function' &&
		typeof (value as RootCtx).dir === 'function'
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

export function createStorageNoCache(
	source: StorageSource,
	options?: CreateStorageOptions
): Storage {
	const filePath = options?.filePath ?? DEFAULT_STORAGE_FILE

	const filePromise = isRootCtx(source)
		? source.getFileHandleForRelative(filePath, true)
		: source.getFileHandle(filePath, { create: true })

	const getData = () => readData(filePromise)
	const persist = (data: Record<string, unknown>) =>
		writeData(filePromise, data)

	return {
		get ready(): boolean {
			return true
		},

		whenReady(): Promise<void> {
			return Promise.resolve()
		},

		getItemSync<T>(_key: string): T | null {
			return null
		},

		keysSync(): string[] {
			return []
		},

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
			iteratee: (
				value: T,
				key: string,
				iterationNumber: number
			) => U | Promise<U>
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

		async flush(): Promise<void> {},
	}
}
