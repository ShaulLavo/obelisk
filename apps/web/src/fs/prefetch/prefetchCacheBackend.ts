/**
 * Prefetch cache backend - persists prefetch progress to IndexedDB
 * so we can resume from where we left off after a restart.
 *
 * Uses a "shape fingerprint" to detect if the filesystem has changed.
 * The fingerprint is based on the root directory's immediate children names,
 * which is a quick check that catches most structural changes.
 */

const DB_NAME = 'prefetch-cache'
const DB_VERSION = 1
const STORE_NAME = 'cache'
const CACHE_KEY = 'prefetch-state'

export type PrefetchCacheState = {
	/** Map of directory path to file count (used to avoid double-counting) */
	loadedDirFileCounts: Record<string, number>
	/** Number of files indexed so far */
	indexedFileCount: number
	/** Fingerprint of the root directory shape for cache invalidation */
	shapeFingerprint: string
	/** Timestamp when the cache was last saved */
	savedAt: number
}

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
				db.createObjectStore(STORE_NAME)
			}
		}
	})

	return dbPromise
}

/**
 * Generate a shape fingerprint from the root directory's children.
 * This is a quick way to detect if the filesystem structure has changed.
 */
export function generateShapeFingerprint(childNames: string[]): string {
	// Sort for consistency, then hash the joined string
	const sorted = [...childNames].sort()
	const str = sorted.join('\0')
	// Simple hash function - not cryptographic, just for comparison
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = ((hash << 5) - hash + char) | 0
	}
	return `v1:${sorted.length}:${hash.toString(36)}`
}

export async function loadPrefetchCache(): Promise<PrefetchCacheState | null> {
	try {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly')
			const store = tx.objectStore(STORE_NAME)
			const request = store.get(CACHE_KEY)

			request.onerror = () => reject(request.error)
			request.onsuccess = () => {
				resolve(request.result ?? null)
			}
		})
	} catch (e) {
		console.warn('prefetchCache: failed to load', e)
		return null
	}
}

export async function savePrefetchCache(
	state: PrefetchCacheState
): Promise<void> {
	try {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			const request = store.put(state, CACHE_KEY)

			request.onerror = () => reject(request.error)
			request.onsuccess = () => resolve()
		})
	} catch (e) {
		console.warn('prefetchCache: failed to save', e)
	}
}

export async function clearPrefetchCache(): Promise<void> {
	try {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite')
			const store = tx.objectStore(STORE_NAME)
			const request = store.delete(CACHE_KEY)

			request.onerror = () => reject(request.error)
			request.onsuccess = () => resolve()
		})
	} catch (e) {
		console.warn('prefetchCache: failed to clear', e)
	}
}
