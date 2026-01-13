/**
 * LocalStorageCache - Synchronous cache layer for view state
 *
 * Provides instant restoration of view state (cursor, selection, scroll, visible content)
 * on page reload. Data is kept in memory first, then written through to localStorage.
 *
 * Design:
 * - Memory Map is the primary store (fast reads)
 * - Write-through to localStorage (debounced)
 * - On init, loads from localStorage into memory
 * - LRU eviction when approaching quota
 */

import type { VisibleContentSnapshot } from '@repo/code-editor'
import type { ViewMode } from '../types/ViewMode'
import type { ScrollPosition } from '../store/types'
import { createFilePath } from '@repo/fs'

export type CursorPosition = {
	line: number
	column: number
	offset: number
}

export type SelectionRange = {
	anchor: number
	focus: number
}

export type LocalStorageFileState = {
	cursor: CursorPosition | null
	selections: SelectionRange[] | null
	scroll: ScrollPosition | null
	visible: VisibleContentSnapshot | null
	viewMode: ViewMode | null
	isDirty: boolean
	savedAt: number
}

export type LocalStorageCacheOptions = {
	/** localStorage key prefix */
	prefix?: string
	/** Debounce delay for localStorage writes (ms) */
	debounceMs?: number
	/** Max entries before LRU eviction */
	maxEntries?: number
	/** Max total size in bytes (approximate) */
	maxSizeBytes?: number
}

const DEFAULT_PREFIX = 'vibe:f:'
const DEFAULT_DEBOUNCE_MS = 100
const DEFAULT_MAX_ENTRIES = 200
const DEFAULT_MAX_SIZE_BYTES = 4 * 1024 * 1024 // 4MB

/**
 * Simple hash function for file paths to keep localStorage keys short
 */
const hashPath = (path: string): string => {
	let hash = 0
	for (let i = 0; i < path.length; i++) {
		const char = path.charCodeAt(i)
		hash = ((hash << 5) - hash) + char
		hash = hash & hash // Convert to 32-bit integer
	}
	// Convert to base36 for compact representation
	return Math.abs(hash).toString(36)
}


export type LocalStorageCache = {
	/** Sync read - returns immediately from memory */
	get: (path: string) => Partial<LocalStorageFileState> | null

	/** Sync write - updates memory + schedules localStorage flush */
	set: (path: string, state: Partial<LocalStorageFileState>) => void

	/** Clear single file from cache */
	clear: (path: string) => void

	/** Clear all cached data */
	clearAll: () => void

	/** Force flush pending writes to localStorage */
	flush: () => void

	/** Get cache stats */
	getStats: () => { entries: number; approximateSize: number }
}

export const createLocalStorageCache = (
	options: LocalStorageCacheOptions = {}
): LocalStorageCache => {
	const prefix = options.prefix ?? DEFAULT_PREFIX
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
	const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES

	// In-memory store - primary source of truth during session
	const memory = new Map<string, LocalStorageFileState>()

	// Track entry sizes for O(1) size updates (avoids recalculating on every write)
	const entrySizes = new Map<string, number>()
	let totalSize = 0

	// LRU tracking using a Map (maintains insertion order, O(1) delete + reinsert)
	const accessOrder = new Map<string, true>()

	// Pending writes (debounced)
	const pendingWrites = new Set<string>()
	let flushTimeout: ReturnType<typeof setTimeout> | null = null

	// Path -> hash mapping for reverse lookup
	const pathToHash = new Map<string, string>()
	const hashToPath = new Map<string, string>()

	const getHash = (path: string): string => {
		const normalized = createFilePath(path)
		let hash = pathToHash.get(normalized)
		if (!hash) {
			hash = hashPath(normalized)
			pathToHash.set(normalized, hash)
			hashToPath.set(hash, normalized)
		}
		return hash
	}

	const getStorageKey = (path: string): string => prefix + getHash(path)

	/**
	 * Update access order for LRU tracking - O(1) using Map
	 */
	const touchAccess = (path: string): void => {
		// Delete and re-add to move to end (most recently used)
		accessOrder.delete(path)
		accessOrder.set(path, true)
	}

	/**
	 * Get the least recently used path - O(1)
	 */
	const getLRUPath = (): string | undefined => {
		const first = accessOrder.keys().next()
		return first.done ? undefined : first.value
	}

	/**
	 * Remove an entry and update size tracking
	 */
	const removeEntry = (path: string): void => {
		const size = entrySizes.get(path) ?? 0
		totalSize -= size
		entrySizes.delete(path)
		memory.delete(path)
		accessOrder.delete(path)

		const hash = pathToHash.get(path)
		if (hash) {
			try {
				localStorage.removeItem(prefix + hash)
			} catch {
				// Ignore
			}
		}
	}

	/**
	 * Evict least recently used entries if over limits
	 */
	const evictIfNeeded = (): void => {
		// Evict by entry count
		while (memory.size > maxEntries) {
			const oldest = getLRUPath()
			if (!oldest) break
			removeEntry(oldest)
		}

		// Evict by size
		while (totalSize > maxSizeBytes) {
			const oldest = getLRUPath()
			if (!oldest) break
			removeEntry(oldest)
		}
	}

	/**
	 * Write pending changes to localStorage
	 */
	const flushToStorage = (): void => {
		console.log('[LocalStorageCache] flushToStorage: flushing', pendingWrites.size, 'entries')
		for (const path of pendingWrites) {
			const normalized = createFilePath(path)
			const state = memory.get(normalized)
			const key = getStorageKey(path)

			console.log('[LocalStorageCache] flushToStorage: writing', {
				path: normalized,
				key,
				hasState: !!state,
				scroll: state?.scroll,
			})

			try {
				if (state) {
					// Store both the state and the original path for reverse lookup
					const toStore = { ...state, _path: normalized }
					localStorage.setItem(key, JSON.stringify(toStore))
					console.log('[LocalStorageCache] flushToStorage: wrote to localStorage')
				} else {
					localStorage.removeItem(key)
				}
			} catch (e) {
				console.log('[LocalStorageCache] flushToStorage: error', e)
				if (e instanceof Error && e.name === 'QuotaExceededError') {
					// Evict more entries and retry
					evictIfNeeded()
					try {
						if (state) {
							const toStore = { ...state, _path: normalized }
							localStorage.setItem(key, JSON.stringify(toStore))
						}
					} catch {
						// Give up on this entry
					}
				}
			}
		}
		pendingWrites.clear()
		flushTimeout = null
	}

	/**
	 * Schedule a debounced flush to localStorage
	 */
	const scheduleFlush = (): void => {
		if (flushTimeout) return
		flushTimeout = setTimeout(flushToStorage, debounceMs)
	}

	/**
	 * Load all cached data from localStorage into memory on init
	 */
	const loadFromStorage = (): void => {
		console.log('[LocalStorageCache] loadFromStorage: starting...')
		let foundCount = 0
		let loadedCount = 0
		try {
			const len = localStorage.length
			for (let i = 0; i < len; i++) {
				const key = localStorage.key(i)
				if (!key || !key.startsWith(prefix)) continue
				foundCount++

				try {
					const raw = localStorage.getItem(key)
					if (!raw) {
						console.log('[LocalStorageCache] loadFromStorage: no raw data for key', key)
						continue
					}

					const parsed = JSON.parse(raw) as LocalStorageFileState & { _path?: string }
					const path = parsed._path
					if (!path) {
						console.log('[LocalStorageCache] loadFromStorage: no _path in entry for key', key, 'data:', raw.slice(0, 100))
						continue
					}

					// Remove internal _path field
					const { _path, ...state } = parsed
					memory.set(path, state as LocalStorageFileState)
					accessOrder.set(path, true)
					loadedCount++

					// Track size
					const size = raw.length * 2 // UTF-16
					entrySizes.set(path, size)
					totalSize += size

					// Rebuild hash mappings
					const hash = key.slice(prefix.length)
					pathToHash.set(path, hash)
					hashToPath.set(hash, path)
					console.log('[LocalStorageCache] loadFromStorage: loaded entry for path', path, 'scroll:', state.scroll)
				} catch (e) {
					console.log('[LocalStorageCache] loadFromStorage: error parsing entry', key, e)
					// Skip corrupted entries
				}
			}
		} catch (e) {
			console.log('[LocalStorageCache] loadFromStorage: localStorage error', e)
			// localStorage not available
		}
		console.log('[LocalStorageCache] loadFromStorage: done. Found:', foundCount, 'Loaded:', loadedCount)
	}

	// Initialize from localStorage
	loadFromStorage()

	const get = (path: string): Partial<LocalStorageFileState> | null => {
		const normalized = createFilePath(path)
		const state = memory.get(normalized)
		if (state) {
			touchAccess(normalized)
		}
		return state ?? null
	}

	const set = (path: string, update: Partial<LocalStorageFileState>): void => {
		const normalized = createFilePath(path)
		console.log('[LocalStorageCache] set():', {
			path: normalized,
			hasScroll: update.scroll !== undefined,
			scroll: update.scroll,
		})
		const existing = memory.get(normalized)

		const newState: LocalStorageFileState = {
			cursor: update.cursor !== undefined ? update.cursor : (existing?.cursor ?? null),
			selections: update.selections !== undefined ? update.selections : (existing?.selections ?? null),
			scroll: update.scroll !== undefined ? update.scroll : (existing?.scroll ?? null),
			visible: update.visible !== undefined ? update.visible : (existing?.visible ?? null),
			viewMode: update.viewMode !== undefined ? update.viewMode : (existing?.viewMode ?? null),
			isDirty: update.isDirty !== undefined ? update.isDirty : (existing?.isDirty ?? false),
			savedAt: Date.now(),
		}

		// Update size tracking
		const oldSize = entrySizes.get(normalized) ?? 0
		const newSize = JSON.stringify(newState).length * 2
		totalSize = totalSize - oldSize + newSize
		entrySizes.set(normalized, newSize)

		memory.set(normalized, newState)
		touchAccess(normalized)
		pendingWrites.add(path)
		evictIfNeeded()
		scheduleFlush()
	}

	const clear = (path: string): void => {
		const normalized = createFilePath(path)
		removeEntry(normalized)
		pendingWrites.delete(path)
	}

	const clearAll = (): void => {
		// Clear memory
		memory.clear()
		accessOrder.clear()
		entrySizes.clear()
		totalSize = 0
		pendingWrites.clear()

		if (flushTimeout) {
			clearTimeout(flushTimeout)
			flushTimeout = null
		}

		// Clear localStorage
		try {
			const keysToRemove: string[] = []
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i)
				if (key && key.startsWith(prefix)) {
					keysToRemove.push(key)
				}
			}
			for (const key of keysToRemove) {
				localStorage.removeItem(key)
			}
		} catch {
			// Ignore
		}

		pathToHash.clear()
		hashToPath.clear()
	}

	const flush = (): void => {
		if (flushTimeout) {
			clearTimeout(flushTimeout)
			flushTimeout = null
		}
		flushToStorage()
	}

	const getStats = (): { entries: number; approximateSize: number } => {
		return {
			entries: memory.size,
			approximateSize: totalSize,
		}
	}

	return {
		get,
		set,
		clear,
		clearAll,
		flush,
		getStats,
	}
}
