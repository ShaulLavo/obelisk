import type { FilePath } from '@repo/fs'
import type { DocumentCache, DocumentCacheEntry } from './documentCache'

const DB_NAME = 'document-cache'
const DB_VERSION = 1
const STORE_NAME = 'documents'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'path' })
			}
		}
	})

	return dbPromise
}

export function createDocumentCache(): DocumentCache {
	const memoryCache = new Map<FilePath, DocumentCacheEntry>()
	const pendingWrites = new Set<FilePath>()
	let flushTimeout: ReturnType<typeof setTimeout> | null = null

	const scheduleFlush = () => {
		if (flushTimeout) return
		flushTimeout = setTimeout(() => {
			flushTimeout = null
			void flush()
		}, 500)
	}

	const set = (path: string, entry: DocumentCacheEntry): void => {
		const existing = memoryCache.get(path as FilePath) ?? {}
		memoryCache.set(path as FilePath, { ...existing, ...entry })
		pendingWrites.add(path as FilePath)
		scheduleFlush()
	}

	const getAsync = async (path: string): Promise<DocumentCacheEntry> => {
		const cached = memoryCache.get(path as FilePath)
		if (cached) return cached

		try {
			const db = await openDB()
			const entry = await new Promise<DocumentCacheEntry | null>(
				(resolve, reject) => {
					const tx = db.transaction(STORE_NAME, 'readonly')
					const store = tx.objectStore(STORE_NAME)
					const request = store.get(path)

					request.onerror = () => reject(request.error)
					request.onsuccess = () => {
						const result = request.result
						if (!result) {
							resolve(null)
							return
						}
						const entry = { ...result }
						delete entry.path
						resolve(entry as DocumentCacheEntry)
					}
				}
			)

			if (entry) {
				memoryCache.set(path as FilePath, entry)
				return entry
			}
		} catch {
			// Ignore DB errors
		}

		return {}
	}

	const flush = async (): Promise<void> => {
		if (pendingWrites.size === 0) return

		try {
			const db = await openDB()
			const paths = Array.from(pendingWrites)
			pendingWrites.clear()

			const tx = db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)

			for (const path of paths) {
				const entry = memoryCache.get(path)
				if (entry) {
					store.put({ path, ...entry })
				}
			}

			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve()
				tx.onerror = () => reject(tx.error)
			})
		} catch {
			// Ignore persistence errors
		}
	}

	return {
		getAsync,
		set,
	}
}
