import type { CacheEntryMetadata, CacheMetadataStore } from './backends/types'

/**
 * Options for configuring the CacheMetadataStore.
 */
export interface MetadataStoreOptions {
	/** localStorage key prefix for storing metadata. Default: 'fc-meta:' */
	keyPrefix?: string
	/** Maximum number of entries to track. Default: 10000 */
	maxEntries?: number
}

/**
 * Interface for the cache metadata store that tracks entry metadata
 * and provides staleness checking against file modification times.
 */
export interface CacheMetadataStoreInterface {
	/** Get metadata for a cache entry */
	getMetadata(path: string): CacheEntryMetadata | null
	
	/** Set metadata for a cache entry */
	setMetadata(path: string, metadata: CacheEntryMetadata): void
	
	/** Remove metadata for a cache entry */
	removeMetadata(path: string): void
	
	/** Check if cached data is stale compared to file mtime */
	isStale(path: string, currentMtime?: number): boolean
	
	/** Update last access time for LRU tracking */
	updateLastAccess(path: string): void
	
	/** Get LRU ordered list of paths (oldest first) */
	getLRUOrder(): string[]
	
	/** Clear all metadata */
	clear(): void
	
	/** Get all tracked paths */
	getAllPaths(): string[]
	
	/** Persist metadata to localStorage */
	persist(): void
	
	/** Load metadata from localStorage */
	load(): void
	
	/** Get current metadata store stats */
	getStats(): { entryCount: number; oldestAccess: number | null; newestAccess: number | null }
}

/**
 * Creates a cache metadata store that persists entry metadata to localStorage
 * for fast startup and provides staleness checking against file modification times.
 */
export function createCacheMetadataStore(options: MetadataStoreOptions = {}): CacheMetadataStoreInterface {
	const keyPrefix = options.keyPrefix ?? 'fc-meta:'
	const maxEntries = options.maxEntries ?? 10000
	const storageKey = `${keyPrefix}store`
	
	// In-memory metadata store
	let metadataStore: CacheMetadataStore = {
		entries: {},
		lruOrder: [],
		version: 1
	}

	const getMetadata = (path: string): CacheEntryMetadata | null => {
		return metadataStore.entries[path] ?? null
	}

	const setMetadata = (path: string, metadata: CacheEntryMetadata): void => {
		// Update metadata
		metadataStore.entries[path] = { ...metadata }
		
		// Update LRU order
		updateLRUOrder(path)
		
		// Enforce max entries limit
		enforceMaxEntries()
	}

	const removeMetadata = (path: string): void => {
		delete metadataStore.entries[path]
		
		// Remove from LRU order
		const index = metadataStore.lruOrder.indexOf(path)
		if (index !== -1) {
			metadataStore.lruOrder.splice(index, 1)
		}
	}

	const updateLRUOrder = (path: string): void => {
		// Remove from current position
		const index = metadataStore.lruOrder.indexOf(path)
		if (index !== -1) {
			metadataStore.lruOrder.splice(index, 1)
		}
		
		// Add to end (most recently used)
		metadataStore.lruOrder.push(path)
	}

	const enforceMaxEntries = (): void => {
		while (metadataStore.lruOrder.length > maxEntries) {
			const oldestPath = metadataStore.lruOrder.shift()
			if (oldestPath) {
				delete metadataStore.entries[oldestPath]
			}
		}
	}

	const isStale = (path: string, currentMtime?: number): boolean => {
		const metadata = getMetadata(path)
		if (!metadata) {
			return true // No metadata means we should treat as stale
		}

		// If no current mtime provided, we can't check staleness
		if (currentMtime === undefined) {
			return false
		}

		// If cached entry has no mtime, treat as not stale
		if (metadata.mtime === undefined) {
			return false
		}

		// Stale if current file is newer than cached version
		return currentMtime > metadata.mtime
	}

	const updateLastAccess = (path: string): void => {
		const metadata = getMetadata(path)
		if (metadata) {
			setMetadata(path, {
				...metadata,
				lastAccess: Date.now()
			})
		}
	}

	const getLRUOrder = (): string[] => {
		return [...metadataStore.lruOrder]
	}

	const clear = (): void => {
		metadataStore = {
			entries: {},
			lruOrder: [],
			version: 1
		}
	}

	const getAllPaths = (): string[] => {
		return Object.keys(metadataStore.entries)
	}

	const persist = (): void => {
		try {
			const serialized = JSON.stringify(metadataStore)
			localStorage.setItem(storageKey, serialized)
		} catch (error) {
			console.warn('Failed to persist cache metadata:', error)
		}
	}

	const load = (): void => {
		try {
			const stored = localStorage.getItem(storageKey)
			if (stored) {
				const parsed = JSON.parse(stored) as CacheMetadataStore
				
				// Validate version compatibility
				if (parsed.version === 1) {
					metadataStore = parsed
				} else {
					console.warn('Cache metadata version mismatch, clearing metadata')
					clear()
				}
			}
		} catch (error) {
			console.warn('Failed to load cache metadata:', error)
			clear()
		}
	}

	const getStats = () => {
		const paths = getAllPaths()
		const entryCount = paths.length
		
		let oldestAccess: number | null = null
		let newestAccess: number | null = null
		
		for (const path of paths) {
			const metadata = getMetadata(path)
			if (metadata) {
				const lastAccess = metadata.lastAccess
				if (oldestAccess === null || lastAccess < oldestAccess) {
					oldestAccess = lastAccess
				}
				if (newestAccess === null || lastAccess > newestAccess) {
					newestAccess = lastAccess
				}
			}
		}
		
		return { entryCount, oldestAccess, newestAccess }
	}

	// Load existing metadata on creation
	load()

	return {
		getMetadata,
		setMetadata,
		removeMetadata,
		isStale,
		updateLastAccess,
		getLRUOrder,
		clear,
		getAllPaths,
		persist,
		load,
		getStats
	}
}

/**
 * Utility function to create metadata for a new cache entry.
 */
export function createCacheEntryMetadata(
	tier: 'hot' | 'warm' | 'cold',
	mtime?: number
): CacheEntryMetadata {
	return {
		lastAccess: Date.now(),
		mtime,
		tier
	}
}

/**
 * Utility function to update metadata when an entry is accessed.
 */
export function touchCacheEntry(
	metadataStore: CacheMetadataStoreInterface,
	path: string,
	tier: 'hot' | 'warm' | 'cold'
): void {
	const existing = metadataStore.getMetadata(path)
	if (existing) {
		metadataStore.setMetadata(path, {
			...existing,
			lastAccess: Date.now(),
			tier
		})
	}
}

/**
 * Utility function to check and clean stale entries from metadata.
 */
export function cleanStaleMetadata(
	metadataStore: CacheMetadataStoreInterface,
	getCurrentMtime: (path: string) => number | undefined
): string[] {
	const stalePaths: string[] = []
	
	for (const path of metadataStore.getAllPaths()) {
		const currentMtime = getCurrentMtime(path)
		if (metadataStore.isStale(path, currentMtime)) {
			stalePaths.push(path)
			metadataStore.removeMetadata(path)
		}
	}
	
	return stalePaths
}