/**
 * Cache Manifest Service
 *
 * Provides cache manifest functionality for service worker offline support.
 * Manages font URL patterns and cache availability information.
 */

export interface CacheManifestEntry {
	url: string
	fontName: string
	size: number
	cachedAt: string
	version: string
	isAvailableOffline: boolean
}

export interface CacheManifest {
	version: string
	entries: CacheManifestEntry[]
	totalSize: number
	lastUpdated: string
	interceptPatterns: string[]
}

export class CacheManifestService {
	private static readonly MANIFEST_VERSION = '1.0'
	private static readonly FONT_URL_PATTERNS = [
		'/fonts/{fontName}',
		'/api/fonts/{fontName}',
	]

	/**
	 * Generate cache manifest for offline font availability
	 */
	async generateManifest(): Promise<CacheManifest> {
		try {
			const { fontMetadataService } = await import('./FontMetadataService')
			const { serviceWorkerManager } = await import('./ServiceWorkerManager')

			// Get all installed fonts metadata
			const allMetadata = await fontMetadataService.getAllFontMetadata()

			// Get service worker cache stats if available
			let swStats = null
			try {
				if (serviceWorkerManager.isSupported()) {
					swStats = await serviceWorkerManager.getCacheStats()
				}
			} catch (error) {
				console.warn('[CacheManifestService] Failed to get SW stats:', error)
			}

			// Build manifest entries
			const entries: CacheManifestEntry[] = []
			let totalSize = 0

			for (const metadata of allMetadata) {
				const entry: CacheManifestEntry = {
					url: `/fonts/${metadata.name}`,
					fontName: metadata.name,
					size: metadata.size,
					cachedAt: metadata.installedAt.toISOString(),
					version: metadata.version,
					isAvailableOffline: await this.checkOfflineAvailability(
						metadata.name
					),
				}

				entries.push(entry)
				totalSize += metadata.size
			}

			return {
				version: CacheManifestService.MANIFEST_VERSION,
				entries,
				totalSize,
				lastUpdated: new Date().toISOString(),
				interceptPatterns: CacheManifestService.FONT_URL_PATTERNS,
			}
		} catch (error) {
			console.error(
				'[CacheManifestService] Failed to generate manifest:',
				error
			)

			// Return empty manifest on error
			return {
				version: CacheManifestService.MANIFEST_VERSION,
				entries: [],
				totalSize: 0,
				lastUpdated: new Date().toISOString(),
				interceptPatterns: CacheManifestService.FONT_URL_PATTERNS,
			}
		}
	}

	/**
	 * Check if a font is available offline (in service worker cache)
	 */
	async checkOfflineAvailability(fontName: string): Promise<boolean> {
		try {
			// Check Cache API directly
			const cache = await caches.open('nerdfonts-v1')
			const cacheKey = `/fonts/${fontName}`
			const cachedResponse = await cache.match(cacheKey)

			return !!cachedResponse
		} catch (error) {
			console.warn(
				`[CacheManifestService] Failed to check offline availability for ${fontName}:`,
				error
			)
			return false
		}
	}

	/**
	 * Get URL patterns that service worker should intercept
	 */
	getInterceptPatterns(): string[] {
		return [...CacheManifestService.FONT_URL_PATTERNS]
	}

	/**
	 * Generate structured URLs for service worker intercept patterns
	 */
	generateInterceptUrls(baseUrl: string = ''): string[] {
		const patterns = this.getInterceptPatterns()

		return patterns.map((pattern) => {
			// Convert pattern to regex-friendly format
			const regexPattern = pattern
				.replace('{fontName}', '[^/]+')
				.replace(/\//g, '\\/')

			return `${baseUrl}${regexPattern}`
		})
	}

	/**
	 * Validate manifest structure
	 */
	validateManifest(manifest: CacheManifest): boolean {
		try {
			// Check required fields
			if (
				!manifest.version ||
				!manifest.entries ||
				!Array.isArray(manifest.entries)
			) {
				return false
			}

			// Validate entries
			for (const entry of manifest.entries) {
				if (!entry.url || !entry.fontName || typeof entry.size !== 'number') {
					return false
				}
			}

			return true
		} catch (error) {
			console.error('[CacheManifestService] Manifest validation error:', error)
			return false
		}
	}

	/**
	 * Export manifest as JSON string
	 */
	async exportManifest(): Promise<string> {
		const manifest = await this.generateManifest()
		return JSON.stringify(manifest, null, 2)
	}

	/**
	 * Import manifest from JSON string
	 */
	importManifest(manifestJson: string): CacheManifest | null {
		try {
			const manifest = JSON.parse(manifestJson) as CacheManifest

			if (this.validateManifest(manifest)) {
				return manifest
			} else {
				console.error('[CacheManifestService] Invalid manifest structure')
				return null
			}
		} catch (error) {
			console.error('[CacheManifestService] Failed to import manifest:', error)
			return null
		}
	}

	/**
	 * Get cache status for monitoring
	 */
	async getCacheStatus(): Promise<{
		isServiceWorkerActive: boolean
		cacheApiSupported: boolean
		manifestGenerated: boolean
		offlineFontsCount: number
		totalCacheSize: number
	}> {
		try {
			const { serviceWorkerManager } = await import('./ServiceWorkerManager')
			const manifest = await this.generateManifest()

			const offlineFonts = manifest.entries.filter(
				(entry) => entry.isAvailableOffline
			)

			return {
				isServiceWorkerActive: serviceWorkerManager.isSupported(),
				cacheApiSupported: 'caches' in window,
				manifestGenerated: manifest.entries.length > 0,
				offlineFontsCount: offlineFonts.length,
				totalCacheSize: manifest.totalSize,
			}
		} catch (error) {
			console.error('[CacheManifestService] Failed to get cache status:', error)

			return {
				isServiceWorkerActive: false,
				cacheApiSupported: 'caches' in window,
				manifestGenerated: false,
				offlineFontsCount: 0,
				totalCacheSize: 0,
			}
		}
	}

	/**
	 * Generate service worker compatible cache keys
	 */
	generateCacheKeys(fontNames: string[]): string[] {
		return fontNames.map((name) => `/fonts/${name}`)
	}

	/**
	 * Extract font name from cache key or URL
	 */
	extractFontName(urlOrKey: string): string | null {
		const patterns = [/\/fonts\/([^\/]+)$/, /\/api\/fonts\/([^\/]+)$/]

		for (const pattern of patterns) {
			const match = urlOrKey.match(pattern)
			if (match) {
				return match[1]!
			}
		}

		return null
	}
}

// Singleton instance
export const cacheManifestService = new CacheManifestService()
