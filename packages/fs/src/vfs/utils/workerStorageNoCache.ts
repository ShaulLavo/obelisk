const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const readData = async (
	fileHandle: FileSystemFileHandle
): Promise<Record<string, unknown>> => {
	const handle = await fileHandle.createSyncAccessHandle()
	try {
		const size = handle.getSize()
		if (size === 0) return {}
		const buffer = new Uint8Array(size)
		handle.read(buffer, { at: 0 })
		return JSON.parse(textDecoder.decode(buffer)) as Record<string, unknown>
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			(error instanceof DOMException) ||
			(error instanceof Error && error.message.includes('NotFound'))
		) {
			return {}
		}
		throw error
	} finally {
		try {
			handle.close()
		} catch {}
	}
}

const writeData = async (
	fileHandle: FileSystemFileHandle,
	data: Record<string, unknown>
): Promise<void> => {
	const handle = await fileHandle.createSyncAccessHandle()
	try {
		const encoded = textEncoder.encode(JSON.stringify(data))
		handle.truncate(0)
		handle.write(encoded, { at: 0 })
		handle.flush()
	} finally {
		try {
			handle.close()
		} catch {}
	}
}

/**
 * Cache-less worker storage using sync access handles; every op re-reads and
 * rewrites the underlying file with no in-memory state retained between calls.
 */
export async function createWorkerStorageNoCache(
	storeName: string = 'sync-store-no-cache'
) {
	const root = await navigator.storage.getDirectory()
	const fileHandle = await root.getFileHandle(`${storeName}.json`, {
		create: true
	})

	return {
		async getItem<T>(key: string): Promise<T | null> {
			const data = await readData(fileHandle)
			const value = data[key]
			return value === undefined ? null : (value as T)
		},

		async setItem<T>(key: string, value: T): Promise<T> {
			const data = await readData(fileHandle)
			data[key] = value
			await writeData(fileHandle, data)
			return value
		},

		async removeItem(key: string): Promise<void> {
			const data = await readData(fileHandle)
			if (!(key in data)) return
			delete data[key]
			await writeData(fileHandle, data)
		},

		async clear(): Promise<void> {
			await writeData(fileHandle, {})
		},

		async keys(): Promise<string[]> {
			const data = await readData(fileHandle)
			return Object.keys(data)
		},

		async flush(): Promise<void> {
			// No-op: writes are immediate
		},

		async close(): Promise<void> {
			// No retained handles to close
		}
	}
}
