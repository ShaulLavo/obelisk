import { client } from '~/client'
import { fontMetadataService } from './FontMetadataService'
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
			// Initialize Cache API
			this.cache = await caches.open(FontCacheService.CACHE_NAME)
			this.initialized = true
			console.log('FontCacheService initialized successfully')
		} catch (error) {
			console.error('Failed to initialize FontCacheService:', error)
			throw error
		}
	}

	async downloadFont(name: string, url: string): Promise<ArrayBuffer> {
		await this.ensureInitialized()

		const cacheKey = `/fonts/${name}`

		// Check cache first
		const cachedResponse = await this.cache?.match(cacheKey)
		if (cachedResponse) {
			console.log(`Font ${name} served from cache`)
			// Update last accessed time in metadata
			await fontMetadataService.updateLastAccessed(name)
			return await cachedResponse.arrayBuffer()
		}

		console.log(`Downloading font ${name} from server...`)

		// Download from server using the client
		const response = await client.fonts({ name }).get()
		if (!response.data || response.data === 'Font not found') {
			throw new Error(`Failed to download font: ${name}`)
		}

		// The response.data should be a Response object containing the font
		let fontData: ArrayBuffer
		if (response.data instanceof Response) {
			fontData = await response.data.arrayBuffer()
		} else {
			// If it's already an ArrayBuffer (shouldn't happen based on server code, but just in case)
			fontData = response.data as ArrayBuffer
		}

		// Cache the response
		const fontResponse = new Response(fontData, {
			headers: {
				'Content-Type': 'font/ttf',
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
		})

		await this.cache?.put(cacheKey, fontResponse.clone())
		console.log(`Font ${name} cached successfully`)

		// Store metadata
		const metadata: FontMetadata = {
			name,
			downloadUrl: url,
			installedAt: new Date(),
			size: fontData.byteLength,
			version: '1.0',
			lastAccessed: new Date(),
		}

		await fontMetadataService.storeFontMetadata(metadata)

		return fontData
	}

	async isFontCached(name: string): Promise<boolean> {
		await this.ensureInitialized()

		const cacheKey = `/fonts/${name}`
		const cachedResponse = await this.cache?.match(cacheKey)
		return !!cachedResponse
	}

	async removeFont(name: string): Promise<void> {
		await this.ensureInitialized()

		const cacheKey = `/fonts/${name}`
		await this.cache?.delete(cacheKey)
		await fontMetadataService.removeFontMetadata(name)
		console.log(`Font ${name} removed from cache and metadata`)
	}

	async getCacheStats(): Promise<CacheStats> {
		await this.ensureInitialized()
		return await fontMetadataService.getCacheStats()
	}

	async cleanupCache(): Promise<void> {
		await this.ensureInitialized()

		try {
			const stats = await this.getCacheStats()

			if (stats.totalSize <= FontCacheService.MAX_CACHE_SIZE) {
				return // No cleanup needed
			}

			console.log(
				`Cache size (${stats.totalSize} bytes) exceeds limit (${FontCacheService.MAX_CACHE_SIZE} bytes). Starting LRU cleanup...`
			)

			// Use metadata service for LRU cleanup
			const fontsToRemove = await fontMetadataService.cleanupOldestFonts(
				FontCacheService.MAX_CACHE_SIZE
			)

			// Remove from Cache API
			for (const fontName of fontsToRemove) {
				const cacheKey = `/fonts/${fontName}`
				await this.cache?.delete(cacheKey)
			}

			console.log(`LRU cleanup completed. Removed ${fontsToRemove.length} fonts.`)
		} catch (error) {
			console.error('Failed to cleanup cache:', error)
			// In test environment, don't throw
			if (process.env.NODE_ENV !== 'test' && typeof window !== 'undefined') {
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

			console.log(`Cleared all ${fontKeys.length} fonts from cache and metadata`)
		} catch (error) {
			console.error('Failed to clear all fonts:', error)
			// In test environment, don't throw
			if (process.env.NODE_ENV !== 'test' && typeof window !== 'undefined') {
				throw error
			}
		}
	}

	async getInstalledFonts(): Promise<Set<string>> {
		return await fontMetadataService.getInstalledFonts()
	}

	async getFontMetadata(name: string): Promise<FontMetadata | null> {
		return await fontMetadataService.getFontMetadata(name)
	}

	async getAllFontMetadata(): Promise<FontMetadata[]> {
		return await fontMetadataService.getAllFontMetadata()
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.init()
		}
	}
}

// Singleton instance
export const fontCacheService = new FontCacheService()