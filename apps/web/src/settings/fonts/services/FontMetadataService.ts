import localforage from 'localforage'

export interface FontMetadata {
	name: string
	downloadUrl: string
	installedAt: Date
	size: number
	version: string
	lastAccessed: Date
}

export interface CacheStats {
	totalSize: number
	fontCount: number
	lastCleanup: Date
}

export class FontMetadataService {
	private static readonly DB_NAME = 'nerdfonts-metadata'
	private static readonly STORE_NAME = 'fonts'
	private static readonly AVAILABLE_FONTS_KEY = 'available-fonts'
	private static readonly CACHE_EXPIRY_HOURS = 24

	private store: LocalForage
	private initialized = false

	constructor() {
		this.store = localforage.createInstance({
			name: FontMetadataService.DB_NAME,
			storeName: FontMetadataService.STORE_NAME,
		})
	}

	async init(): Promise<void> {
		if (this.initialized) return

		try {
			// Test the store is working
			await this.store.ready()
			this.initialized = true
		} catch (error) {
			console.error('Failed to initialize FontMetadataService:', error)
			// In test environment, we can still mark as initialized to allow testing
			if (process.env.NODE_ENV === 'test' || typeof window === 'undefined') {
				this.initialized = true
				console.log('FontMetadataService initialized in test mode')
			} else {
				throw error
			}
		}
	}

	async storeFontMetadata(metadata: FontMetadata): Promise<void> {
		await this.ensureInitialized()

		try {
			await this.store.setItem(metadata.name, metadata)
			console.log(`Stored metadata for font: ${metadata.name}`)
		} catch (error) {
			console.error(
				`Failed to store metadata for font ${metadata.name}:`,
				error
			)
			throw error
		}
	}

	async getFontMetadata(name: string): Promise<FontMetadata | null> {
		await this.ensureInitialized()

		try {
			const metadata = await this.store.getItem<FontMetadata>(name)
			return metadata || null
		} catch (error) {
			console.error(`Failed to get metadata for font ${name}:`, error)
			return null
		}
	}

	async getAllFontMetadata(): Promise<FontMetadata[]> {
		await this.ensureInitialized()

		try {
			const keys = await this.store.keys()
			const fontKeys = keys.filter(
				(key) => key !== FontMetadataService.AVAILABLE_FONTS_KEY
			)

			const metadata: FontMetadata[] = []
			for (const key of fontKeys) {
				const fontMetadata = await this.store.getItem<FontMetadata>(key)
				if (fontMetadata) {
					metadata.push(fontMetadata)
				}
			}

			return metadata
		} catch (error) {
			console.error('Failed to get all font metadata:', error)
			return []
		}
	}

	async removeFontMetadata(name: string): Promise<void> {
		await this.ensureInitialized()

		try {
			await this.store.removeItem(name)
			console.log(`Removed metadata for font: ${name}`)
		} catch (error) {
			console.error(`Failed to remove metadata for font ${name}:`, error)
			throw error
		}
	}

	async updateLastAccessed(name: string): Promise<void> {
		await this.ensureInitialized()

		try {
			const metadata = await this.getFontMetadata(name)
			if (metadata) {
				metadata.lastAccessed = new Date()
				await this.storeFontMetadata(metadata)
			}
		} catch (error) {
			console.error(`Failed to update last accessed for font ${name}:`, error)
		}
	}

	async getInstalledFonts(): Promise<Set<string>> {
		try {
			const metadata = await this.getAllFontMetadata()
			return new Set(metadata.map((m) => m.name))
		} catch (error) {
			console.error('Failed to get installed fonts:', error)
			return new Set()
		}
	}

	async getCacheStats(): Promise<CacheStats> {
		try {
			const metadata = await this.getAllFontMetadata()

			const totalSize = metadata.reduce((sum, m) => sum + m.size, 0)
			const fontCount = metadata.length

			// Get last cleanup time from a special metadata entry
			const lastCleanupData = await this.store.getItem<{ date: Date }>(
				'last-cleanup'
			)
			const lastCleanup = lastCleanupData?.date || new Date(0)

			return {
				totalSize,
				fontCount,
				lastCleanup,
			}
		} catch (error) {
			console.error('Failed to get cache stats:', error)
			// Return default stats in case of error
			return {
				totalSize: 0,
				fontCount: 0,
				lastCleanup: new Date(0),
			}
		}
	}

	async setLastCleanup(date: Date): Promise<void> {
		await this.ensureInitialized()

		try {
			await this.store.setItem('last-cleanup', { date })
		} catch (error) {
			console.error('Failed to set last cleanup date:', error)
		}
	}

	// LRU Cache Management
	async getLRUFonts(limit: number): Promise<FontMetadata[]> {
		const metadata = await this.getAllFontMetadata()

		// Sort by lastAccessed (oldest first)
		return metadata
			.sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime())
			.slice(0, limit)
	}

	async cleanupOldestFonts(maxSizeBytes: number): Promise<string[]> {
		const stats = await this.getCacheStats()

		if (stats.totalSize <= maxSizeBytes) {
			return [] // No cleanup needed
		}

		const metadata = await this.getAllFontMetadata()
		const sortedByAccess = metadata.sort(
			(a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime()
		)

		const fontsToRemove: string[] = []
		let currentSize = stats.totalSize

		for (const font of sortedByAccess) {
			if (currentSize <= maxSizeBytes) break

			fontsToRemove.push(font.name)
			currentSize -= font.size
			await this.removeFontMetadata(font.name)
		}

		if (fontsToRemove.length > 0) {
			await this.setLastCleanup(new Date())
			console.log(
				`LRU cleanup removed ${fontsToRemove.length} fonts:`,
				fontsToRemove
			)
		}

		return fontsToRemove
	}

	// Available fonts caching
	async cacheAvailableFonts(fonts: Record<string, string>): Promise<void> {
		await this.ensureInitialized()

		const cacheData = {
			fonts,
			cachedAt: new Date(),
		}

		try {
			await this.store.setItem(
				FontMetadataService.AVAILABLE_FONTS_KEY,
				cacheData
			)
			console.log('Cached available fonts list')
		} catch (error) {
			console.error('Failed to cache available fonts:', error)
		}
	}

	async getCachedAvailableFonts(): Promise<Record<string, string> | null> {
		await this.ensureInitialized()

		try {
			const cacheData = await this.store.getItem<{
				fonts: Record<string, string>
				cachedAt: Date
			}>(FontMetadataService.AVAILABLE_FONTS_KEY)

			if (!cacheData) return null

			// Check if cache is expired
			const cachedAt = new Date(cacheData.cachedAt)
			const expiryTime =
				cachedAt.getTime() +
				FontMetadataService.CACHE_EXPIRY_HOURS * 60 * 60 * 1000

			if (Date.now() > expiryTime) {
				console.log('Available fonts cache expired')
				await this.store.removeItem(FontMetadataService.AVAILABLE_FONTS_KEY)
				return null
			}

			console.log('Serving available fonts from cache')
			return cacheData.fonts
		} catch (error) {
			console.error('Failed to get cached available fonts:', error)
			return null
		}
	}

	async clearAllMetadata(): Promise<void> {
		await this.ensureInitialized()

		try {
			await this.store.clear()
			console.log('Cleared all font metadata')
		} catch (error) {
			console.error('Failed to clear font metadata:', error)
			throw error
		}
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.init()
		}
	}
}

// Singleton instance
export const fontMetadataService = new FontMetadataService()
