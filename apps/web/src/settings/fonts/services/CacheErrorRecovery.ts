import { fontMetadataService, type FontMetadata } from './FontMetadataService'
import { createLazySingleton } from './createLazySingleton'

export type CacheErrorType =
	| 'cache_api_unavailable'
	| 'indexeddb_unavailable'
	| 'storage_quota_exceeded'
	| 'cache_corruption'
	| 'metadata_corruption'
	| 'permission_denied'

export type CacheRecoveryStrategy =
	| 'fallback_memory'
	| 'fallback_localstorage'
	| 'clear_and_rebuild'
	| 'reduce_cache_size'
	| 'disable_caching'

export type CacheRecoveryResult = {
	success: boolean
	strategy: CacheRecoveryStrategy
	message: string
	fallbackActive: boolean
}

/**
 * Service for handling cache errors and implementing recovery strategies
 * Provides fallback storage options when Cache API or IndexedDB fail
 */
export class CacheErrorRecoveryService {
	private fallbackStorage = new Map<string, ArrayBuffer>()
	private fallbackMetadata = new Map<string, FontMetadata>()
	private cacheApiAvailable = true
	private indexedDBAvailable = true
	private fallbackMode = false

	categorizeError(error: Error): CacheErrorType {
		// Check DOMException.name first for reliable classification
		if (error instanceof DOMException) {
			switch (error.name) {
				case 'QuotaExceededError':
					return 'storage_quota_exceeded'
				case 'NotFoundError':
				case 'InvalidStateError':
					return 'cache_corruption'
				case 'NotAllowedError':
				case 'SecurityError':
					return 'permission_denied'
				case 'AbortError':
				case 'UnknownError':
					return 'indexeddb_unavailable'
			}
		}

		// Fall back to message-string matching
		const message = error.message.toLowerCase()

		if (message.includes('cache') && message.includes('not supported')) {
			return 'cache_api_unavailable'
		}

		if (message.includes('indexeddb') || message.includes('database')) {
			return 'indexeddb_unavailable'
		}

		if (message.includes('quota') || message.includes('storage full')) {
			return 'storage_quota_exceeded'
		}

		if (message.includes('corrupt') || message.includes('invalid')) {
			return 'cache_corruption'
		}

		if (message.includes('permission') || message.includes('access denied')) {
			return 'permission_denied'
		}

		return 'cache_corruption'
	}

	getRecoveryStrategy(errorType: CacheErrorType): CacheRecoveryStrategy {
		switch (errorType) {
			case 'cache_api_unavailable':
				return 'fallback_localstorage'

			case 'indexeddb_unavailable':
				return 'fallback_localstorage'

			case 'storage_quota_exceeded':
				return 'reduce_cache_size'

			case 'cache_corruption':
			case 'metadata_corruption':
				return 'clear_and_rebuild'

			case 'permission_denied':
				return 'fallback_memory'

			default:
				return 'fallback_memory'
		}
	}

	async recoverFromError(error: Error): Promise<CacheRecoveryResult> {
		const errorType = this.categorizeError(error)
		const strategy = this.getRecoveryStrategy(errorType)

		try {
			switch (strategy) {
				case 'fallback_memory':
					return this.enableMemoryFallback()

				case 'fallback_localstorage':
					return this.enableLocalStorageFallback()

				case 'clear_and_rebuild':
					return await this.clearAndRebuildCache()

				case 'reduce_cache_size':
					return await this.reduceCacheSize()

				case 'disable_caching':
					return this.disableCaching()

				default:
					return {
						success: false,
						strategy,
						message: 'Unknown recovery strategy',
						fallbackActive: false,
					}
			}
		} catch (recoveryError) {

			// Last resort: disable caching entirely
			return this.disableCaching()
		}
	}

	private enableMemoryFallback(): CacheRecoveryResult {
		this.fallbackMode = true
		this.cacheApiAvailable = false
		this.indexedDBAvailable = false

		return {
			success: true,
			strategy: 'fallback_memory',
			message:
				'Using memory-only storage. Fonts will be lost when the page is refreshed.',
			fallbackActive: true,
		}
	}

	private enableLocalStorageFallback(): CacheRecoveryResult {
		try {
			// Test localStorage availability
			const testKey = 'font-cache-test'
			localStorage.setItem(testKey, 'test')
			localStorage.removeItem(testKey)

			this.fallbackMode = true
			this.indexedDBAvailable = false

			return {
				success: true,
				strategy: 'fallback_localstorage',
				message:
					'Using localStorage for font metadata. Some features may be limited.',
				fallbackActive: true,
			}
		} catch (error) {
			return this.enableMemoryFallback()
		}
	}

	private async clearAndRebuildCache(): Promise<CacheRecoveryResult> {
		try {
			// Best-effort cleanup — each step is independent, failures don't block others
			if ('caches' in window) {
				try {
					await caches.delete('nerdfonts-v1')
				} catch (error) {
					// Cache API delete failed during rebuild — continue with other cleanup
				}
			}

			try {
				await fontMetadataService.clearAllMetadata()
			} catch (error) {
				// Metadata clear failed during rebuild — continue with other cleanup
			}

			try {
				const keys = Object.keys(localStorage)
				for (const key of keys) {
					if (key.startsWith('font-')) {
						localStorage.removeItem(key)
					}
				}
			} catch (error) {
				// localStorage cleanup failed during rebuild — continue with other cleanup
			}

			return {
				success: true,
				strategy: 'clear_and_rebuild',
				message:
					'Cache cleared and rebuilt. You may need to re-download fonts.',
				fallbackActive: false,
			}
		} catch (error) {
			return this.enableMemoryFallback()
		}
	}

	private async reduceCacheSize(): Promise<CacheRecoveryResult> {
		try {
			const allMetadata = await fontMetadataService.getAllFontMetadata()
			const sortedByAccess = allMetadata.sort(
				(a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime()
			)

			// Remove oldest 50% of fonts
			const fontsToRemove = sortedByAccess.slice(
				0,
				Math.floor(sortedByAccess.length / 2)
			)

			for (const metadata of fontsToRemove) {
				try {
					if ('caches' in window) {
						const cache = await caches.open('nerdfonts-v1')
						await cache.delete(`/fonts/${metadata.name}`)
					}

					await fontMetadataService.removeFontMetadata(metadata.name)
				} catch (error) {
					// Individual font removal failed — continue with remaining fonts
				}
			}

			return {
				success: true,
				strategy: 'reduce_cache_size',
				message: `Removed ${fontsToRemove.length} fonts to free up storage space.`,
				fallbackActive: false,
			}
		} catch (error) {
			return await this.clearAndRebuildCache()
		}
	}

	private disableCaching(): CacheRecoveryResult {
		this.fallbackMode = true
		this.cacheApiAvailable = false
		this.indexedDBAvailable = false

		return {
			success: true,
			strategy: 'disable_caching',
			message:
				'Font caching disabled. Fonts will be downloaded fresh each time.',
			fallbackActive: true,
		}
	}

	storeFontFallback(name: string, data: ArrayBuffer): void {
		if (!this.fallbackMode) {
			throw new Error('Fallback mode not enabled')
		}

		this.fallbackStorage.set(name, data)
	}

	getFontFallback(name: string): ArrayBuffer | null {
		if (!this.fallbackMode) {
			return null
		}

		return this.fallbackStorage.get(name) || null
	}

	async storeMetadataFallback(
		name: string,
		metadata: FontMetadata
	): Promise<void> {
		if (!this.fallbackMode) {
			throw new Error('Fallback mode not enabled')
		}

		if (this.indexedDBAvailable) {
			// Try localStorage first
			try {
				localStorage.setItem(`font-metadata-${name}`, JSON.stringify(metadata))
				return
			} catch {
				// localStorage may be full or unavailable — fall through to memory storage
			}
		}

		// Fall back to memory storage
		this.fallbackMetadata.set(name, metadata)
	}

	async getMetadataFallback(name: string): Promise<FontMetadata | null> {
		if (!this.fallbackMode) {
			return null
		}

		// Try localStorage first
		if (!this.indexedDBAvailable) {
			try {
				const stored = localStorage.getItem(`font-metadata-${name}`)
				if (stored) {
					return JSON.parse(stored)
				}
			} catch {
				// localStorage read failed — fall through to memory storage
			}
		}

		// Fall back to memory storage
		return this.fallbackMetadata.get(name) || null
	}

	isFallbackMode(): boolean {
		return this.fallbackMode
	}

	getCacheStatus(): {
		cacheAPI: boolean
		indexedDB: boolean
		fallback: boolean
	} {
		return {
			cacheAPI: this.cacheApiAvailable,
			indexedDB: this.indexedDBAvailable,
			fallback: this.fallbackMode,
		}
	}

	reset(): void {
		this.fallbackStorage.clear()
		this.fallbackMetadata.clear()
		this.cacheApiAvailable = true
		this.indexedDBAvailable = true
		this.fallbackMode = false
	}
}

const _singleton = createLazySingleton(() => new CacheErrorRecoveryService())

/** Lazy singleton -- created on first access, not at import time. */
export const getCacheErrorRecovery = _singleton.get

/** @deprecated Use getCacheErrorRecovery() instead. */
export const cacheErrorRecovery = _singleton.deprecated
