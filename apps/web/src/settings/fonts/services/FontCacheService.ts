/**
 * Font Cache Service
 *
 * Owns the Cache API storage for font binary data. This is a core service
 * consumed by the font registry (src/fonts/) via dynamic import.
 *
 * Direct singleton imports: fontMetadataService, cacheErrorRecovery, serviceWorkerManager.
 * These are acceptable here because FontCacheService is the primary orchestrator
 * for cache operations and needs synchronous access to error recovery state
 * (e.g., isFallbackMode checks on every cache read).
 */
import { client } from '~/client'
import { fontMetadataService } from './FontMetadataService'
import { cacheErrorRecovery } from './CacheErrorRecovery'
import { serviceWorkerManager } from './ServiceWorkerManager'
import type { FontMetadata, CacheStats } from './FontMetadataService'

// Re-export types for convenience
export type { FontMetadata, CacheStats }

export class FontCacheService {
	private static readonly CACHE_NAME = 'nerdfonts-v1'
	private static readonly MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB

	private cache: Cache | null = null
	private initialized = false

	async init(): Promise<void> {
		if (this.initialized) return

		try {
			try {
				await serviceWorkerManager.init()
			} catch (swError) {
				// Service worker init failed, continuing without offline support
			}

			if (!('caches' in window)) {
				throw new Error('Cache API not supported')
			}

			this.cache = await caches.open(FontCacheService.CACHE_NAME)
			this.initialized = true
		} catch (error) {

			const recovery = await cacheErrorRecovery.recoverFromError(error as Error)

			if (recovery.success) {
				this.initialized = true

				if (recovery.fallbackActive) {
					this.notifyFallbackMode(recovery.message)
				}
			} else {
				throw error
			}
		}
	}

	async downloadFont(name: string, url: string): Promise<ArrayBuffer> {
		await this.ensureInitialized()

		const cacheKey = `/fonts/${name}`

		try {
			const cache = this.activeCache
			if (cache) {
				const cachedResponse = await cache.match(cacheKey)
				if (cachedResponse) {
					await this.updateLastAccessedSafely(name)
					return await cachedResponse.arrayBuffer()
				}
			} else {
				const fallbackData = await cacheErrorRecovery.getFontFallback(name)
				if (fallbackData) {
					return fallbackData
				}
			}

			const response = await client.fonts({ name }).get()
			if (!response.data || response.data === 'Font not found') {
				throw new Error(`Failed to download font: ${name}`)
			}

			let fontData: ArrayBuffer
			if (response.data instanceof Response) {
				fontData = await response.data.arrayBuffer()
			} else {
				fontData = response.data as ArrayBuffer
			}

			await this.storeFontDataSafely(name, fontData, cacheKey)

			const metadata: FontMetadata = {
				name,
				downloadUrl: url,
				installedAt: new Date(),
				size: fontData.byteLength,
				version: '1.0',
				lastAccessed: new Date(),
			}

			await this.storeMetadataSafely(metadata)

			return fontData
		} catch (error) {

			const recovery = await cacheErrorRecovery.recoverFromError(error as Error)

			if (recovery.success && recovery.fallbackActive) {
				return await this.downloadFont(name, url)
			}

			throw error
		}
	}

	async isFontCached(name: string): Promise<boolean> {
		await this.ensureInitialized()

		try {
			const cache = this.activeCache
			if (cache) {
				const cacheKey = `/fonts/${name}`
				const cachedResponse = await cache.match(cacheKey)
				return !!cachedResponse
			} else {
				const fallbackData = await cacheErrorRecovery.getFontFallback(name)
				return !!fallbackData
			}
		} catch (error) {
			return false
		}
	}

	async storeFont(name: string, fontData: ArrayBuffer): Promise<void> {
		await this.ensureInitialized()
		const cacheKey = `/fonts/${name}`
		await this.storeFontDataSafely(name, fontData, cacheKey)
	}

	async removeFont(name: string): Promise<void> {
		await this.ensureInitialized()

		try {
			const cache = this.activeCache
			if (cache) {
				const cacheKey = `/fonts/${name}`
				await cache.delete(cacheKey)
			}

			if (this.activeCache) {
				await fontMetadataService.removeFontMetadata(name)
			} else {
				try {
					localStorage.removeItem(`font-metadata-${name}`)
				} catch (error) {
					// localStorage removal failed
				}
			}
		} catch (error) {
			const recovery = await cacheErrorRecovery.recoverFromError(error as Error)
			if (!recovery.success) {
				throw error
			}
		}
	}

	private static emptyCacheStats(): CacheStats {
		return { totalSize: 0, fontCount: 0, lastCleanup: new Date() }
	}

	async getCacheStats(): Promise<CacheStats> {
		await this.ensureInitialized()

		try {
			if (this.activeCache) {
				return await fontMetadataService.getCacheStats()
			}
			return FontCacheService.emptyCacheStats()
		} catch (error) {
			return FontCacheService.emptyCacheStats()
		}
	}

	async cleanupCache(): Promise<void> {
		await this.ensureInitialized()

		try {
			const stats = await this.getCacheStats()

			if (stats.totalSize <= FontCacheService.MAX_CACHE_SIZE) {
				return
			}

			// LRU cleanup: remove oldest accessed fonts until we are under the limit
			const allFonts = await fontMetadataService.getAllFontMetadata()
			allFonts.sort((a, b) => {
				const timeA = new Date(a.lastAccessed).getTime()
				const timeB = new Date(b.lastAccessed).getTime()
				return timeA - timeB
			})

			let currentSize = stats.totalSize
			const fontsToRemove: string[] = []

			for (const font of allFonts) {
				if (currentSize <= FontCacheService.MAX_CACHE_SIZE) break
				fontsToRemove.push(font.name)
				currentSize -= font.size
			}

			for (const fontName of fontsToRemove) {
				const cacheKey = `/fonts/${fontName}`
				await this.cache?.delete(cacheKey)
				await this.removeFont(fontName)
			}
		} catch (error) {
			if (import.meta.env.MODE !== 'test' && typeof window !== 'undefined') {
				throw error
			}
		}
	}

	async clearAllFonts(): Promise<void> {
		await this.ensureInitialized()

		try {
			const keys = await this.cache?.keys()
			if (!keys) return

			const fontKeys = keys.filter((request) => request.url.includes('/fonts/'))

			for (const key of fontKeys) {
				await this.cache?.delete(key)
			}

			await fontMetadataService.clearAllMetadata()
		} catch (error) {
			if (import.meta.env.MODE !== 'test' && typeof window !== 'undefined') {
				throw error
			}
		}
	}

	async getInstalledFonts(): Promise<Set<string>> {
		return await fontMetadataService.getInstalledFonts()
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.init()
		}
	}

	/** Returns the active Cache handle when not in fallback mode, or null otherwise. */
	private get activeCache(): Cache | null {
		return !cacheErrorRecovery.isFallbackMode() ? this.cache : null
	}

	/**
	 * Safely store font data with fallback options
	 */
	private async storeFontDataSafely(
		name: string,
		fontData: ArrayBuffer,
		cacheKey: string
	): Promise<void> {
		try {
			const cache = this.activeCache
			if (cache) {
				const fontResponse = new Response(fontData, {
					headers: {
						'Content-Type': 'font/ttf',
						'Cache-Control': 'public, max-age=31536000, immutable',
					},
				})

				await cache.put(cacheKey, fontResponse.clone())
			} else {
				await cacheErrorRecovery.storeFontFallback(name, fontData)
			}
		} catch (error) {
			const recovery = await cacheErrorRecovery.recoverFromError(error as Error)
			if (recovery.success) {
				await cacheErrorRecovery.storeFontFallback(name, fontData)
			} else {
				throw error
			}
		}
	}

	/**
	 * Safely store metadata with fallback options
	 */
	private async storeMetadataSafely(metadata: FontMetadata): Promise<void> {
		try {
			if (this.activeCache) {
				await fontMetadataService.storeFontMetadata(metadata)
			} else {
				await cacheErrorRecovery.storeMetadataFallback(metadata.name, metadata)
			}
		} catch (error) {
			const recovery = await cacheErrorRecovery.recoverFromError(error as Error)
			if (recovery.success) {
				await cacheErrorRecovery.storeMetadataFallback(metadata.name, metadata)
			}
		}
	}

	/**
	 * Safely update last accessed time
	 */
	private async updateLastAccessedSafely(name: string): Promise<void> {
		try {
			if (this.activeCache) {
				await fontMetadataService.updateLastAccessed(name)
			} else {
				const metadata = await cacheErrorRecovery.getMetadataFallback(name)
				if (metadata) {
					metadata.lastAccessed = new Date()
					await cacheErrorRecovery.storeMetadataFallback(name, metadata)
				}
			}
		} catch (error) {
			// Last accessed update failed, non-critical
		}
	}

	/**
	 * Notify user about fallback mode activation
	 */
	private notifyFallbackMode(message: string): void {
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('font-cache-fallback', {
					detail: { message },
				})
			)
		}
	}
}

export const fontCacheService = new FontCacheService()
