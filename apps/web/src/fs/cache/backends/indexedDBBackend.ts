import localforage from 'localforage'
import type { AsyncStorageBackend } from './types'

/**
 * Configuration options for the IndexedDB backend.
 */
export interface IndexedDBBackendOptions {
	/** Database name. Default: 'file-cache' */
	dbName?: string
	/** Store name. Default: 'entries' */
	storeName?: string
	/** Maximum entries before eviction. Default: 1000 */
	maxEntries?: number
	/** Debounce delay for batch writes in ms. Default: 100 */
	debounceDelay?: number
}

/**
 * Metadata for tracking entry access times and sizes for LRU eviction.
 */
interface EntryMetadata {
	/** Last access timestamp for LRU */
	lastAccess: number
	/** Approximate size in bytes */
	size: number
}

/**
 * IndexedDB-based persistent cache with async access.
 * Uses localForage for simplified API and better browser compatibility.
 * 
 * Features:
 * - Async get/set/remove/clear/keys operations
 * - LRU eviction based on entry count limits
 * - Batch writes with debouncing to minimize transaction overhead
 * - Size tracking for monitoring
 * - Graceful error handling with fallback behavior
 */
export class IndexedDBBackend<T = unknown> implements AsyncStorageBackend<T> {
	private readonly maxEntries: number
	private readonly debounceDelay: number
	private readonly store: LocalForage
	private readonly metadataStore: LocalForage
	
	// Track metadata for LRU eviction
	private metadata = new Map<string, EntryMetadata>()
	private metadataLoaded = false
	
	// Debouncing for batch writes
	private pendingWrites = new Map<string, { value: T; metadata: EntryMetadata }>()
	private writeTimeout: ReturnType<typeof setTimeout> | null = null
	
	// Track approximate total size
	private approximateSize = 0

	constructor(options: IndexedDBBackendOptions = {}) {
		this.maxEntries = options.maxEntries ?? 1000
		this.debounceDelay = options.debounceDelay ?? 100
		
		const dbName = options.dbName ?? 'file-cache'
		const storeName = options.storeName ?? 'entries'
		
		// Create localForage instances for data and metadata
		this.store = localforage.createInstance({
			name: dbName,
			storeName: storeName,
			driver: [localforage.INDEXEDDB]
		})
		
		this.metadataStore = localforage.createInstance({
			name: dbName,
			storeName: `${storeName}_metadata`,
			driver: [localforage.INDEXEDDB]
		})
	}

	async get(key: string): Promise<T | null> {
		try {
			await this.ensureMetadataLoaded()
			
			const value = await this.store.getItem<T>(key)
			if (value === null) {
				return null
			}
			
			// Update access timestamp for LRU tracking
			const metadata = this.metadata.get(key)
			if (metadata) {
				metadata.lastAccess = Date.now()
				// Schedule metadata save (debounced)
				this.scheduleMetadataSave()
			}
			
			return value
		} catch (error) {
			console.warn(`IndexedDBBackend: Failed to get key "${key}":`, error)
			return null
		}
	}

	async set(key: string, value: T): Promise<T> {
		try {
			await this.ensureMetadataLoaded()
			
			const size = this.estimateValueSize(value)
			const metadata: EntryMetadata = {
				lastAccess: Date.now(),
				size
			}
			
			// Update internal tracking
			const existingMetadata = this.metadata.get(key)
			const existingSize = existingMetadata?.size ?? 0
			this.approximateSize = this.approximateSize - existingSize + size
			this.metadata.set(key, metadata)
			
			// Check if we need to evict entries
			if (this.metadata.size > this.maxEntries) {
				await this.evictLRU()
			}
			
			// Schedule batched write
			this.pendingWrites.set(key, { value, metadata })
			this.scheduleBatchWrite()
			
			return value
		} catch (error) {
			console.warn(`IndexedDBBackend: Failed to set key "${key}":`, error)
			throw error
		}
	}

	async remove(key: string): Promise<void> {
		try {
			await this.ensureMetadataLoaded()
			
			// Update size tracking
			const metadata = this.metadata.get(key)
			if (metadata) {
				this.approximateSize -= metadata.size
				this.metadata.delete(key)
			}
			
			// Remove from pending writes if present
			this.pendingWrites.delete(key)
			
			// Remove from storage
			await this.store.removeItem(key)
			
			// Schedule metadata save
			this.scheduleMetadataSave()
		} catch (error) {
			console.warn(`IndexedDBBackend: Failed to remove key "${key}":`, error)
		}
	}

	async has(key: string): Promise<boolean> {
		try {
			await this.ensureMetadataLoaded()
			
			// Check pending writes first
			if (this.pendingWrites.has(key)) {
				return true
			}
			
			const value = await this.store.getItem(key)
			return value !== null
		} catch (error) {
			console.warn(`IndexedDBBackend: Failed to check key "${key}":`, error)
			return false
		}
	}

	async keys(): Promise<string[]> {
		try {
			await this.ensureMetadataLoaded()
			
			const storeKeys = await this.store.keys()
			const pendingKeys = Array.from(this.pendingWrites.keys())
			
			// Combine store keys with pending write keys, removing duplicates
			const allKeys = new Set([...storeKeys, ...pendingKeys])
			return Array.from(allKeys)
		} catch (error) {
			console.warn('IndexedDBBackend: Failed to get keys:', error)
			return []
		}
	}

	async clear(): Promise<void> {
		try {
			// Clear pending writes
			this.pendingWrites.clear()
			if (this.writeTimeout) {
				clearTimeout(this.writeTimeout)
				this.writeTimeout = null
			}
			
			// Clear stores
			await this.store.clear()
			await this.metadataStore.clear()
			
			// Reset internal state
			this.metadata.clear()
			this.approximateSize = 0
		} catch (error) {
			console.warn('IndexedDBBackend: Failed to clear:', error)
		}
	}

	async estimateSize(): Promise<number> {
		return this.approximateSize
	}

	/**
	 * Ensure metadata is loaded from storage.
	 */
	private async ensureMetadataLoaded(): Promise<void> {
		if (this.metadataLoaded) {
			return
		}
		
		try {
			const storedMetadata = await this.metadataStore.getItem<Record<string, EntryMetadata>>('metadata')
			if (storedMetadata) {
				this.metadata = new Map(Object.entries(storedMetadata))
				
				// Calculate total size
				this.approximateSize = Array.from(this.metadata.values())
					.reduce((sum, meta) => sum + meta.size, 0)
			}
			
			this.metadataLoaded = true
		} catch (error) {
			console.warn('IndexedDBBackend: Failed to load metadata, starting fresh:', error)
			this.metadata.clear()
			this.approximateSize = 0
			this.metadataLoaded = true
		}
	}

	/**
	 * Schedule a debounced batch write operation.
	 */
	private scheduleBatchWrite(): void {
		if (this.writeTimeout) {
			clearTimeout(this.writeTimeout)
		}
		
		this.writeTimeout = setTimeout(() => {
			this.flushPendingWrites().catch(error => {
				console.warn('IndexedDBBackend: Failed to flush pending writes:', error)
			})
		}, this.debounceDelay)
	}

	/**
	 * Flush all pending writes to IndexedDB.
	 */
	private async flushPendingWrites(): Promise<void> {
		if (this.pendingWrites.size === 0) {
			return
		}
		
		const writes = Array.from(this.pendingWrites.entries())
		this.pendingWrites.clear()
		this.writeTimeout = null
		
		const failedWrites: Array<[string, { value: T; metadata: EntryMetadata }]> = []
		let hasSuccessfulWrite = false
		let hasDroppedWrite = false
		
		for (const [key, data] of writes) {
			try {
				await this.store.setItem(key, data.value)
				hasSuccessfulWrite = true
			} catch (error) {
				if (this.isDataCloneError(error)) {
					hasDroppedWrite = true
					this.dropMetadataForKey(key, data.metadata)
					console.log(
						'[IndexedDBBackend] Dropping uncloneable value',
						JSON.stringify(
							{
								key,
								type: typeof data.value,
								tag: Object.prototype.toString.call(data.value),
							},
							null,
							2
						)
					)
					continue
				}
				console.warn(`IndexedDBBackend: Failed to write "${key}":`, error)
				failedWrites.push([key, data])
			}
		}
		
		if (failedWrites.length > 0) {
			for (const [key, data] of failedWrites) {
				this.pendingWrites.set(key, data)
			}
			
			setTimeout(() => {
				this.scheduleBatchWrite()
			}, this.debounceDelay * 2)
			return
		}
		
		if (hasSuccessfulWrite || hasDroppedWrite) {
			await this.saveMetadata()
		}
	}

	/**
	 * Schedule a debounced metadata save operation.
	 */
	private scheduleMetadataSave(): void {
		// Piggyback on the existing write timeout for efficiency
		if (!this.writeTimeout) {
			this.writeTimeout = setTimeout(() => {
				this.saveMetadata().catch(error => {
					console.warn('IndexedDBBackend: Failed to save metadata:', error)
				})
				this.writeTimeout = null
			}, this.debounceDelay)
		}
	}

	/**
	 * Save metadata to IndexedDB.
	 */
	private async saveMetadata(): Promise<void> {
		try {
			const metadataObj = Object.fromEntries(this.metadata.entries())
			await this.metadataStore.setItem('metadata', metadataObj)
		} catch (error) {
			console.warn('IndexedDBBackend: Failed to save metadata:', error)
		}
	}

	private dropMetadataForKey(key: string, metadataFallback?: EntryMetadata): void {
		const metadata = this.metadata.get(key) ?? metadataFallback
		if (metadata) {
			this.approximateSize = Math.max(0, this.approximateSize - metadata.size)
		}
		this.metadata.delete(key)
	}

	private isDataCloneError(error: unknown): boolean {
		if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
			return error.name === 'DataCloneError'
		}
		if (typeof error !== 'object' || !error) {
			return false
		}
		if (!('name' in error)) {
			return false
		}
		const name = (error as { name?: unknown }).name
		return typeof name === 'string' && name === 'DataCloneError'
	}

	/**
	 * Evict the least recently used entries when over capacity.
	 */
	private async evictLRU(): Promise<void> {
		const entriesToEvict = this.metadata.size - this.maxEntries
		if (entriesToEvict <= 0) {
			return
		}
		
		// Sort entries by last access time (oldest first)
		const sortedEntries = Array.from(this.metadata.entries())
			.sort(([, a], [, b]) => a.lastAccess - b.lastAccess)
		
		// Evict the oldest entries
		const evictionPromises: Promise<void>[] = []
		
		for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
			const entry = sortedEntries[i]
			if (entry) {
				const [key] = entry
				evictionPromises.push(this.remove(key))
			}
		}
		
		await Promise.all(evictionPromises)
	}

	/**
	 * Estimate the size of a value in bytes.
	 * This is a rough approximation for monitoring purposes.
	 */
	private estimateValueSize(value: T): number {
		if (value === null || value === undefined) {
			return 0
		}
		
		if (typeof value === 'string') {
			return value.length * 2 // Rough estimate for UTF-16
		}
		
		if (typeof value === 'number' || typeof value === 'boolean') {
			return 8
		}
		
		if (value instanceof Uint8Array) {
			return value.byteLength
		}
		
		if (value instanceof ArrayBuffer) {
			return value.byteLength
		}
		
		if (Array.isArray(value)) {
			return value.reduce((sum, item) => sum + this.estimateValueSize(item), 0) + 24 // Array overhead
		}
		
		if (typeof value === 'object') {
			// Rough estimate: JSON string length as proxy for object size
			try {
				return JSON.stringify(value).length * 2
			} catch {
				return 100 // Fallback for non-serializable objects
			}
		}
		
		return 50 // Default fallback
	}
}

/**
 * Factory function to create an IndexedDB backend instance.
 */
export function createIndexedDBBackend<T = unknown>(options?: IndexedDBBackendOptions): AsyncStorageBackend<T> {
	return new IndexedDBBackend<T>(options)
}
