import localforage from 'localforage'
import { createLazySingleton } from './createLazySingleton'
import { withFontStorage } from './withFontStorage'

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

/**
 * Manages persistent font metadata (install dates, sizes, access times, etc.)
 * backed by a localforage (IndexedDB) store.
 *
 * All public methods except `init()` are fail-safe: on storage errors they
 * log at debug level and return a safe default (empty array, null, empty set,
 * or void) so callers never need to handle storage failures.
 */
export class FontMetadataService {
	private static readonly DB_NAME = 'nerdfonts-metadata'
	private static readonly STORE_NAME = 'fonts'
	private static readonly AVAILABLE_FONTS_KEY = 'available-fonts'
	private static readonly CACHE_EXPIRY_HOURS = 24

	private _store: LocalForage | null = null
	private initialized = false

	/** Lazily create the localforage instance on first access */
	private get store(): LocalForage {
		if (!this._store) {
			this._store = localforage.createInstance({
				name: FontMetadataService.DB_NAME,
				storeName: FontMetadataService.STORE_NAME,
			})
		}
		return this._store
	}

	async init(): Promise<void> {
		if (this.initialized) return

		try {
			// Test the store is working
			await this.store.ready()
			this.initialized = true
		} catch (error) {
			// In test environment, we can still mark as initialized to allow testing
			if (process.env.NODE_ENV === 'test' || typeof window === 'undefined') {
				this.initialized = true
			} else {
				throw error
			}
		}
	}

	async storeFontMetadata(metadata: FontMetadata): Promise<void> {
		await this.ensureInitialized()
		await withFontStorage(
			() => this.store.setItem(metadata.name, metadata).then(() => {}),
			undefined,
			`FontMetadataService.storeFontMetadata(${metadata.name})`,
		)
	}

	async getFontMetadata(name: string): Promise<FontMetadata | null> {
		await this.ensureInitialized()
		return withFontStorage(
			async () => (await this.store.getItem<FontMetadata>(name)) || null,
			null,
			`FontMetadataService.getFontMetadata(${name})`,
		)
	}

	async getAllFontMetadata(): Promise<FontMetadata[]> {
		await this.ensureInitialized()
		return withFontStorage(
			async () => {
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
			},
			[],
			'FontMetadataService.getAllFontMetadata',
		)
	}

	async removeFontMetadata(name: string): Promise<void> {
		await this.ensureInitialized()
		await withFontStorage(
			() => this.store.removeItem(name),
			undefined,
			`FontMetadataService.removeFontMetadata(${name})`,
		)
	}

	async updateLastAccessed(name: string): Promise<void> {
		await this.ensureInitialized()
		await withFontStorage(
			async () => {
				const metadata = await this.getFontMetadata(name)
				if (metadata) {
					metadata.lastAccessed = new Date()
					await this.storeFontMetadata(metadata)
				}
			},
			undefined,
			`FontMetadataService.updateLastAccessed(${name})`,
		)
	}

	async getInstalledFonts(): Promise<Set<string>> {
		return withFontStorage(
			async () => {
				const metadata = await this.getAllFontMetadata()
				return new Set(metadata.map((m) => m.name))
			},
			new Set<string>(),
			'FontMetadataService.getInstalledFonts',
		)
	}

	async getCacheStats(): Promise<CacheStats> {
		return withFontStorage(
			async () => {
				const metadata = await this.getAllFontMetadata()

				const totalSize = metadata.reduce((sum, m) => sum + m.size, 0)
				const fontCount = metadata.length

				// Get last cleanup time from a special metadata entry
				const lastCleanupData = await this.store.getItem<{ date: Date }>(
					'last-cleanup'
				)
				const lastCleanup = lastCleanupData?.date || new Date(0)

				return { totalSize, fontCount, lastCleanup }
			},
			{ totalSize: 0, fontCount: 0, lastCleanup: new Date(0) },
			'FontMetadataService.getCacheStats',
		)
	}

	async setLastCleanup(date: Date): Promise<void> {
		await this.ensureInitialized()
		await withFontStorage(
			() => this.store.setItem('last-cleanup', { date }).then(() => {}),
			undefined,
			'FontMetadataService.setLastCleanup',
		)
	}

	// LRU Cache Management
	async getLRUFonts(limit: number): Promise<FontMetadata[]> {
		const metadata = await this.getAllFontMetadata()

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
		}

		return fontsToRemove
	}

	// Available fonts caching
	async cacheAvailableFonts(fonts: Record<string, string>): Promise<void> {
		await this.ensureInitialized()
		await withFontStorage(
			() =>
				this.store
					.setItem(FontMetadataService.AVAILABLE_FONTS_KEY, {
						fonts,
						cachedAt: new Date(),
					})
					.then(() => {}),
			undefined,
			'FontMetadataService.cacheAvailableFonts',
		)
	}

	async getCachedAvailableFonts(): Promise<Record<string, string> | null> {
		await this.ensureInitialized()
		return withFontStorage(
			async () => {
				const cacheData = await this.store.getItem<{
					fonts: Record<string, string>
					cachedAt: Date
				}>(FontMetadataService.AVAILABLE_FONTS_KEY)

				if (!cacheData) return null

				const cachedAt = new Date(cacheData.cachedAt)
				const expiryTime =
					cachedAt.getTime() +
					FontMetadataService.CACHE_EXPIRY_HOURS * 60 * 60 * 1000

				if (Date.now() > expiryTime) {
					await this.store.removeItem(FontMetadataService.AVAILABLE_FONTS_KEY)
					return null
				}

				return cacheData.fonts
			},
			null,
			'FontMetadataService.getCachedAvailableFonts',
		)
	}

	async clearAllMetadata(): Promise<void> {
		await this.ensureInitialized()
		await withFontStorage(
			() => this.store.clear(),
			undefined,
			'FontMetadataService.clearAllMetadata',
		)
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.init()
		}
	}
}

const _singleton = createLazySingleton(() => new FontMetadataService())

/** Lazy singleton -- created on first access, not at import time. */
export const getFontMetadataService = _singleton.get

/** @deprecated Use getFontMetadataService() instead. */
export const fontMetadataService = _singleton.deprecated
