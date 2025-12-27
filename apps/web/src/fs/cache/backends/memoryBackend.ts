import type { SyncStorageBackend } from './types'

/**
 * Configuration options for the memory backend.
 */
export interface MemoryBackendOptions {
	/** Maximum number of entries before eviction. Default: 100 */
	maxEntries?: number
	/** Callback when entry is evicted */
	onEvict?: (key: string, value: unknown) => void
}

/**
 * Node in the doubly-linked list for LRU tracking.
 */
interface LRUNode<T> {
	key: string
	value: T
	prev: LRUNode<T> | null
	next: LRUNode<T> | null
}

/**
 * In-memory LRU cache with synchronous access.
 * Evicts least recently used entries when capacity is reached.
 * 
 * Uses a Map for O(1) key-value access and a doubly-linked list
 * for O(1) LRU order tracking and eviction.
 */
export class MemoryBackend<T = unknown> implements SyncStorageBackend<T> {
	private readonly maxEntries: number
	private readonly onEvict?: (key: string, value: unknown) => void
	private readonly cache = new Map<string, LRUNode<T>>()
	
	// Doubly-linked list sentinels for LRU tracking
	private readonly head: LRUNode<T>
	private readonly tail: LRUNode<T>
	
	// Track approximate size for monitoring
	private approximateSize = 0

	constructor(options: MemoryBackendOptions = {}) {
		this.maxEntries = options.maxEntries ?? 100
		this.onEvict = options.onEvict
		
		// Initialize sentinel nodes for doubly-linked list
		this.head = { key: '', value: null as T, prev: null, next: null }
		this.tail = { key: '', value: null as T, prev: null, next: null }
		this.head.next = this.tail
		this.tail.prev = this.head
	}

	get(key: string): T | null {
		const node = this.cache.get(key)
		if (!node) {
			return null
		}
		
		// Move to front (most recently used)
		this.moveToFront(node)
		return node.value
	}

	set(key: string, value: T): T {
		const existingNode = this.cache.get(key)
		
		if (existingNode) {
			// Update existing entry
			const oldSize = this.estimateValueSize(existingNode.value)
			existingNode.value = value
			this.approximateSize = this.approximateSize - oldSize + this.estimateValueSize(value)
			this.moveToFront(existingNode)
			return value
		}
		
		// Add new entry
		const newNode: LRUNode<T> = {
			key,
			value,
			prev: null,
			next: null
		}
		
		this.cache.set(key, newNode)
		this.addToFront(newNode)
		this.approximateSize += this.estimateValueSize(value)
		
		// Evict if over capacity
		if (this.cache.size > this.maxEntries) {
			this.evictLRU()
		}
		
		return value
	}

	remove(key: string): void {
		const node = this.cache.get(key)
		if (!node) {
			return
		}
		
		this.approximateSize -= this.estimateValueSize(node.value)
		this.cache.delete(key)
		this.removeFromList(node)
	}

	has(key: string): boolean {
		return this.cache.has(key)
	}

	keys(): string[] {
		return Array.from(this.cache.keys())
	}

	clear(): void {
		this.cache.clear()
		this.head.next = this.tail
		this.tail.prev = this.head
		this.approximateSize = 0
	}

	estimateSize(): number {
		return this.approximateSize
	}

	/**
	 * Move node to front of LRU list (most recently used position).
	 */
	private moveToFront(node: LRUNode<T>): void {
		this.removeFromList(node)
		this.addToFront(node)
	}

	/**
	 * Add node to front of LRU list.
	 */
	private addToFront(node: LRUNode<T>): void {
		node.prev = this.head
		node.next = this.head.next
		if (this.head.next) {
			this.head.next.prev = node
		}
		this.head.next = node
	}

	/**
	 * Remove node from doubly-linked list.
	 */
	private removeFromList(node: LRUNode<T>): void {
		if (node.prev) {
			node.prev.next = node.next
		}
		if (node.next) {
			node.next.prev = node.prev
		}
	}

	/**
	 * Evict the least recently used entry (from tail of list).
	 */
	private evictLRU(): void {
		const lru = this.tail.prev
		if (!lru || lru === this.head) {
			return // No entries to evict
		}
		
		// Call eviction callback before removing
		if (this.onEvict) {
			this.onEvict(lru.key, lru.value)
		}
		
		this.cache.delete(lru.key)
		this.removeFromList(lru)
		this.approximateSize -= this.estimateValueSize(lru.value)
	}

	/**
	 * Estimate the memory size of a value in bytes.
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
 * Factory function to create a memory backend instance.
 */
export function createMemoryBackend<T = unknown>(options?: MemoryBackendOptions): SyncStorageBackend<T> {
	return new MemoryBackend<T>(options)
}