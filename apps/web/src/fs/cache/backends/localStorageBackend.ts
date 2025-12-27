import type { SyncStorageBackend } from './types'

/**
 * Configuration options for the localStorage backend.
 */
export interface LocalStorageBackendOptions {
	/** Key prefix to namespace storage. Default: 'fc:' */
	prefix?: string
	/** Maximum total size in bytes. Default: 5MB */
	maxSize?: number
}

/**
 * localStorage-based persistent cache with synchronous access.
 * Automatically evicts oldest entries when quota is exceeded.
 * 
 * Features:
 * - JSON serialization for all values
 * - Size tracking and enforcement
 * - Quota exceeded recovery with LRU eviction
 * - Key namespacing with configurable prefix
 */
export class LocalStorageBackend<T = unknown> implements SyncStorageBackend<T> {
	private readonly prefix: string
	private readonly maxSize: number
	private readonly metadataKey: string
	
	// Track current size and entry metadata
	private currentSize = 0
	private metadata = new Map<string, { size: number; timestamp: number }>()

	constructor(options: LocalStorageBackendOptions = {}) {
		this.prefix = options.prefix ?? 'fc:'
		this.maxSize = options.maxSize ?? 5 * 1024 * 1024 // 5MB default
		this.metadataKey = `${this.prefix}__metadata__`
		
		// Load existing metadata on initialization
		this.loadMetadata()
	}

	get(key: string): T | null {
		const storageKey = this.getStorageKey(key)
		
		try {
			const item = this.getLocalStorage().getItem(storageKey)
			if (item === null) {
				return null
			}
			
			// Update access timestamp for LRU tracking
			const metadata = this.metadata.get(key)
			if (metadata) {
				metadata.timestamp = Date.now()
				this.saveMetadata()
			}
			
			return JSON.parse(item) as T
		} catch (error) {
			// Handle JSON parse errors or localStorage access errors
			console.warn(`LocalStorageBackend: Failed to get key "${key}":`, error)
			this.remove(key) // Clean up corrupted entry
			return null
		}
	}

	set(key: string, value: T): T {
		const storageKey = this.getStorageKey(key)
		
		try {
			const serialized = JSON.stringify(value)
			const size = serialized.length * 2 // Rough UTF-16 byte estimate
			
			// Check if we need to make space
			const existingMetadata = this.metadata.get(key)
			const existingSize = existingMetadata?.size ?? 0
			const sizeIncrease = size - existingSize
			
			if (this.currentSize + sizeIncrease > this.maxSize) {
				this.evictToMakeSpace(sizeIncrease)
			}
			
			// Attempt to store the item
			this.storeWithQuotaRecovery(storageKey, serialized, key, size)
			
			return value
		} catch (error) {
			console.warn(`LocalStorageBackend: Failed to set key "${key}":`, error)
			throw error
		}
	}

	remove(key: string): void {
		const storageKey = this.getStorageKey(key)
		
		try {
			this.getLocalStorage().removeItem(storageKey)
			
			// Update metadata
			const metadata = this.metadata.get(key)
			if (metadata) {
				this.currentSize -= metadata.size
				this.metadata.delete(key)
				this.saveMetadata()
			}
		} catch (error) {
			console.warn(`LocalStorageBackend: Failed to remove key "${key}":`, error)
		}
	}

	has(key: string): boolean {
		const storageKey = this.getStorageKey(key)
		return this.getLocalStorage().getItem(storageKey) !== null
	}

	keys(): string[] {
		const keys: string[] = []
		
		try {
			const localStorage = this.getLocalStorage()
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i)
				if (key && key.startsWith(this.prefix) && key !== this.metadataKey) {
					// Remove prefix to get original key
					keys.push(key.slice(this.prefix.length))
				}
			}
		} catch (error) {
			console.warn('LocalStorageBackend: Failed to get keys:', error)
		}
		
		return keys
	}

	clear(): void {
		try {
			// Remove all keys with our prefix
			const keysToRemove: string[] = []
			const localStorage = this.getLocalStorage()
			
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i)
				if (key && key.startsWith(this.prefix)) {
					keysToRemove.push(key)
				}
			}
			
			for (const key of keysToRemove) {
				localStorage.removeItem(key)
			}
			
			// Reset internal state
			this.currentSize = 0
			this.metadata.clear()
		} catch (error) {
			console.warn('LocalStorageBackend: Failed to clear:', error)
		}
	}

	estimateSize(): number {
		return this.currentSize
	}

	/**
	 * Generate storage key with prefix.
	 */
	private getStorageKey(key: string): string {
		return `${this.prefix}${key}`
	}

	/**
	 * Get localStorage instance, handling both browser and test environments.
	 */
	private getLocalStorage(): Storage {
		if (typeof window !== 'undefined' && window.localStorage) {
			return window.localStorage
		}
		if (typeof global !== 'undefined' && (global as any).window?.localStorage) {
			return (global as any).window.localStorage
		}
		throw new Error('localStorage is not available')
	}

	/**
	 * Load metadata from localStorage to track sizes and timestamps.
	 */
	private loadMetadata(): void {
		try {
			const metadataJson = this.getLocalStorage().getItem(this.metadataKey)
			if (metadataJson) {
				const parsed = JSON.parse(metadataJson) as Record<string, { size: number; timestamp: number }>
				this.metadata = new Map(Object.entries(parsed))
				
				// Calculate current total size
				this.currentSize = Array.from(this.metadata.values())
					.reduce((sum, meta) => sum + meta.size, 0)
			}
		} catch (error) {
			console.warn('LocalStorageBackend: Failed to load metadata, starting fresh:', error)
			this.metadata.clear()
			this.currentSize = 0
		}
	}

	/**
	 * Save metadata to localStorage.
	 */
	private saveMetadata(): void {
		try {
			const metadataObj = Object.fromEntries(this.metadata.entries())
			this.getLocalStorage().setItem(this.metadataKey, JSON.stringify(metadataObj))
		} catch (error) {
			console.warn('LocalStorageBackend: Failed to save metadata:', error)
		}
	}

	/**
	 * Evict oldest entries to make space for new data.
	 */
	private evictToMakeSpace(requiredSpace: number): void {
		// Sort entries by timestamp (oldest first)
		const sortedEntries = Array.from(this.metadata.entries())
			.sort(([, a], [, b]) => a.timestamp - b.timestamp)
		
		let freedSpace = 0
		
		for (const [key, metadata] of sortedEntries) {
			if (freedSpace >= requiredSpace) {
				break
			}
			
			this.remove(key)
			freedSpace += metadata.size
		}
	}

	/**
	 * Store item with quota exceeded recovery.
	 * If localStorage quota is exceeded, evict oldest entries and retry.
	 */
	private storeWithQuotaRecovery(storageKey: string, serialized: string, key: string, size: number): void {
		const maxRetries = 3
		let retries = 0
		
		while (retries < maxRetries) {
			try {
				this.getLocalStorage().setItem(storageKey, serialized)
				
				// Update metadata on successful store
				const existingMetadata = this.metadata.get(key)
				const existingSize = existingMetadata?.size ?? 0
				
				this.currentSize = this.currentSize - existingSize + size
				this.metadata.set(key, { size, timestamp: Date.now() })
				this.saveMetadata()
				
				return // Success
			} catch (error) {
				if (error instanceof DOMException && (
					error.name === 'QuotaExceededError' ||
					error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
				)) {
					// Quota exceeded - evict some entries and retry
					retries++
					
					if (retries >= maxRetries) {
						// If we've tried multiple times and still can't fit, 
						// the item is probably too large for the available quota
						console.warn(`LocalStorageBackend: Item "${key}" too large for available quota after ${maxRetries} attempts`)
						throw new Error(`LocalStorageBackend: Item too large for available storage quota`)
					}
					
					// Evict 25% of current entries to make space, or at least 1 entry
					const entriesToEvict = Math.max(1, Math.floor(this.metadata.size * 0.25))
					const sortedEntries = Array.from(this.metadata.entries())
						.sort(([, a], [, b]) => a.timestamp - b.timestamp)
					
					let evicted = 0
					for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
						const entry = sortedEntries[i]
						if (entry) {
							this.remove(entry[0])
							evicted++
						}
					}
					
					// If we couldn't evict anything, the cache is empty and the item is too large
					if (evicted === 0) {
						console.warn(`LocalStorageBackend: Item "${key}" too large for empty cache`)
						throw new Error(`LocalStorageBackend: Item too large for storage`)
					}
				} else {
					// Other error - rethrow
					throw error
				}
			}
		}
	}
}

/**
 * Factory function to create a localStorage backend instance.
 */
export function createLocalStorageBackend<T = unknown>(options?: LocalStorageBackendOptions): SyncStorageBackend<T> {
	return new LocalStorageBackend<T>(options)
}