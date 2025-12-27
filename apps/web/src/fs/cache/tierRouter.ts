import type {
	SyncStorageBackend,
	AsyncStorageBackend,
	TierRoutingConfig,
} from './backends/types'
import { DEFAULT_ROUTING } from './backends/types'
import type { FileCacheEntry } from './fileCacheController'

/**
 * Options for configuring the TierRouter.
 */
export interface TierRouterOptions {
	/** Hot cache backend (memory) - synchronous */
	hot: SyncStorageBackend<unknown>
	/** Warm cache backend (localStorage) - synchronous */
	warm: SyncStorageBackend<unknown>
	/** Cold cache backend (IndexedDB) - asynchronous */
	cold: AsyncStorageBackend<unknown>
	/** Custom routing configuration */
	routing?: TierRoutingConfig
}

/**
 * Manages routing of cache entries to appropriate storage tiers and handles
 * lookup order (Hot → Warm → Cold) with promotion from cold to hot on access.
 *
 * FileSystemAccessHandle objects can ONLY be cached in IndexedDB (not localStorage/memory)
 * due to serialization constraints.
 */
export class TierRouter {
	private hot: SyncStorageBackend<unknown>
	private warm: SyncStorageBackend<unknown>
	private cold: AsyncStorageBackend<unknown>
	private routing: TierRoutingConfig

	constructor(options: TierRouterOptions) {
		this.hot = options.hot
		this.warm = options.warm
		this.cold = options.cold
		this.routing = options.routing ?? DEFAULT_ROUTING
	}

	/**
	 * Determines which tier a data type should be stored in based on routing configuration.
	 */
	private getTierForDataType(
		dataType: keyof FileCacheEntry
	): 'hot' | 'warm' | 'cold' {
		if (this.routing.hotOnly.includes(dataType)) {
			return 'hot'
		}
		if (this.routing.warm.includes(dataType)) {
			return 'warm'
		}
		if (this.routing.cold.includes(dataType)) {
			return 'cold'
		}
		// Default to cold for unknown data types
		return 'cold'
	}

	/**
	 * Gets the storage backend for a specific tier.
	 */
	private getBackendForTier(tier: 'hot' | 'warm'): SyncStorageBackend<unknown>
	private getBackendForTier(tier: 'cold'): AsyncStorageBackend<unknown>
	private getBackendForTier(
		tier: 'hot' | 'warm' | 'cold'
	): SyncStorageBackend<unknown> | AsyncStorageBackend<unknown> {
		switch (tier) {
			case 'hot':
				return this.hot
			case 'warm':
				return this.warm
			case 'cold':
				return this.cold
		}
	}

	/**
	 * Generates a cache key for a specific path and data type.
	 * Format: "v1:{path}:{dataType}"
	 */
	private generateCacheKey(
		path: string,
		dataType: keyof FileCacheEntry
	): string {
		return `v1:${path}:${dataType}`
	}

	/**
	 * Stores a value in the appropriate tier based on data type routing.
	 */
	async set(
		path: string,
		dataType: keyof FileCacheEntry,
		value: unknown
	): Promise<void> {
		const tier = this.getTierForDataType(dataType)
		const key = this.generateCacheKey(path, dataType)

		try {
			if (tier === 'cold') {
				const backend = this.getBackendForTier(tier)
				await backend.set(key, value)
			} else {
				const backend = this.getBackendForTier(tier)
				backend.set(key, value)
			}
		} catch (error) {
			console.warn(`Failed to store ${key} in ${tier} tier:`, error)

			if (tier === 'cold') {
				try {
					this.warm.set(key, value)
				} catch {
					this.hot.set(key, value)
				}
			} else if (tier === 'warm') {
				try {
					this.hot.set(key, value)
				} catch {
					console.error(`Failed to store ${key} in any available tier`)
				}
			}
		}
	}

	/**
	 * Retrieves a value following tier lookup order (Hot → Warm → Cold).
	 * Promotes cold cache entries to hot cache on access.
	 */
	async get(
		path: string,
		dataType: keyof FileCacheEntry
	): Promise<unknown | null> {
		const key = this.generateCacheKey(path, dataType)

		try {
			const hotResult = this.hot.get(key)
			if (hotResult !== null) {
				return hotResult
			}
		} catch (error) {
			console.warn(`Failed to get ${key} from hot cache:`, error)
		}

		try {
			const warmResult = this.warm.get(key)
			if (warmResult !== null) {
				try {
					this.hot.set(key, warmResult)
				} catch (error) {
					console.warn(`Failed to promote ${key} to hot cache:`, error)
				}
				return warmResult
			}
		} catch (error) {
			console.warn(`Failed to get ${key} from warm cache:`, error)
		}

		try {
			const coldResult = await this.cold.get(key)
			if (coldResult !== null) {
				try {
					this.hot.set(key, coldResult)
				} catch (error) {
					console.warn(`Failed to promote ${key} to hot cache:`, error)
				}
				return coldResult
			}
		} catch (error) {
			console.warn(`Failed to get ${key} from cold cache:`, error)
		}

		return null
	}

	/**
	 * Removes a value from all tiers.
	 */
	async remove(path: string, dataType: keyof FileCacheEntry): Promise<void> {
		const key = this.generateCacheKey(path, dataType)

		// Remove from all tiers, continue even if some fail
		const promises = [
			Promise.resolve()
				.then(() => this.hot.remove(key))
				.catch((error) =>
					console.warn(`Failed to remove ${key} from hot cache:`, error)
				),
			Promise.resolve()
				.then(() => this.warm.remove(key))
				.catch((error) =>
					console.warn(`Failed to remove ${key} from warm cache:`, error)
				),
			this.cold
				.remove(key)
				.catch((error) =>
					console.warn(`Failed to remove ${key} from cold cache:`, error)
				),
		]

		await Promise.all(promises)
	}

	/**
	 * Checks if a value exists in any tier.
	 */
	async has(path: string, dataType: keyof FileCacheEntry): Promise<boolean> {
		const key = this.generateCacheKey(path, dataType)

		try {
			// Check in order: hot → warm → cold
			if (this.hot.has(key)) return true
			if (this.warm.has(key)) return true
			if (await this.cold.has(key)) return true
		} catch (error) {
			console.warn(`Failed to check existence of ${key}:`, error)
		}

		return false
	}

	/**
	 * Clears all entries for a specific path from all tiers.
	 */
	async clearPath(path: string): Promise<void> {
		// Get all possible data types from FileCacheEntry
		const dataTypes: Array<keyof FileCacheEntry> = [
			'pieceTable',
			'stats',
			'previewBytes',
			'highlights',
			'folds',
			'brackets',
			'errors',
			'scrollPosition',
			'visibleContent',
		]

		// Remove each data type for this path
		const promises = dataTypes.map((dataType) => this.remove(path, dataType))
		await Promise.all(promises)
	}

	/**
	 * Clears all entries from all tiers.
	 */
	async clearAll(): Promise<void> {
		const promises = [
			Promise.resolve()
				.then(() => this.hot.clear())
				.catch((error) => console.warn('Failed to clear hot cache:', error)),
			Promise.resolve()
				.then(() => this.warm.clear())
				.catch((error) => console.warn('Failed to clear warm cache:', error)),
			this.cold
				.clear()
				.catch((error) => console.warn('Failed to clear cold cache:', error)),
		]

		await Promise.all(promises)
	}

	/**
	 * Gets all keys from all tiers.
	 */
	async getAllKeys(): Promise<string[]> {
		try {
			const [hotKeys, warmKeys, coldKeys] = await Promise.all([
				Promise.resolve(this.hot.keys()).catch(() => []),
				Promise.resolve(this.warm.keys()).catch(() => []),
				this.cold.keys().catch(() => []),
			])

			// Deduplicate keys
			const allKeys = new Set([...hotKeys, ...warmKeys, ...coldKeys])
			return Array.from(allKeys)
		} catch (error) {
			console.warn('Failed to get all keys:', error)
			return []
		}
	}

	/**
	 * Gets estimated size for each tier.
	 */
	async getStats(): Promise<{ hot: number; warm: number; cold: number }> {
		try {
			const [hotSize, warmSize, coldSize] = await Promise.all([
				Promise.resolve(this.hot.estimateSize?.() ?? 0),
				Promise.resolve(this.warm.estimateSize?.() ?? 0),
				this.cold.estimateSize?.() ?? Promise.resolve(0),
			])

			return {
				hot: hotSize,
				warm: warmSize,
				cold: coldSize,
			}
		} catch (error) {
			console.warn('Failed to get cache stats:', error)
			return { hot: 0, warm: 0, cold: 0 }
		}
	}

	/**
	 * Updates the routing configuration.
	 */
	updateRouting(newRouting: TierRoutingConfig): void {
		this.routing = newRouting
	}

	/**
	 * Gets the current routing configuration.
	 */
	getRouting(): TierRoutingConfig {
		return { ...this.routing }
	}
}
