import { fontCacheService } from './FontCacheService'
import { fontInstallationService } from './FontInstallationService'

export class FontRestorationService {
	private static instance: FontRestorationService | null = null
	private isRestoring = false
	private restorationPromise: Promise<void> | null = null

	static getInstance(): FontRestorationService {
		if (!FontRestorationService.instance) {
			FontRestorationService.instance = new FontRestorationService()
		}
		return FontRestorationService.instance
	}

	/**
	 * Restore all cached fonts to document.fonts on application startup
	 */
	async restoreFonts(): Promise<void> {
		// Prevent multiple simultaneous restoration attempts
		if (this.isRestoring) {
			return this.restorationPromise || Promise.resolve()
		}

		this.isRestoring = true
		this.restorationPromise = this.performRestoration()

		try {
			await this.restorationPromise
		} finally {
			this.isRestoring = false
			this.restorationPromise = null
		}
	}

	private async performRestoration(): Promise<void> {
		try {

			// Initialize services
			await fontCacheService.init()
			await fontInstallationService.initialize()

			// Get all cached fonts
			const cachedFonts = await fontCacheService.getInstalledFonts()
			console.log(
				'[FontRestorationService] Found cached fonts:',
				Array.from(cachedFonts)
			)

			if (cachedFonts.size === 0) {
				return
			}

			// Restore each font
			const restorationPromises = Array.from(cachedFonts).map(
				async (fontName) => {
					try {
						// Check if font is already installed in document.fonts
						if (fontInstallationService.isFontInstalled(fontName)) {
							console.log(
								`[FontRestorationService] Font ${fontName} already installed, skipping`
							)
							return
						}


						// Get font data from cache
						const fontData = await this.getFontDataFromCache(fontName)

						// Install font using FontFace API
						const fontFace = new FontFace(fontName, fontData, {
							display: 'swap',
							style: 'normal',
							weight: 'normal',
							stretch: 'normal',
						})

						await fontFace.load()
						document.fonts.add(fontFace)

						console.log(
							`[FontRestorationService] Successfully restored font: ${fontName}`
						)
					} catch (error) {
						console.error(
							`[FontRestorationService] Failed to restore font ${fontName}:`,
							error
						)

						// Remove from cache if restoration fails (font data might be corrupted)
						try {
							await fontCacheService.removeFont(fontName)
							console.log(
								`[FontRestorationService] Removed corrupted font ${fontName} from cache`
							)
						} catch (removeError) {
							console.error(
								`[FontRestorationService] Failed to remove corrupted font ${fontName}:`,
								removeError
							)
						}
					}
				}
			)

			await Promise.allSettled(restorationPromises)

			// Update font installation service state
			await fontInstallationService.initialize()

		} catch (error) {
			console.error('[FontRestorationService] Font restoration failed:', error)
			throw error
		}
	}

	private async getFontDataFromCache(name: string): Promise<ArrayBuffer> {
		const cacheKey = `/fonts/${name}`
		const cache = await caches.open('nerdfonts-v1')
		const cachedResponse = await cache.match(cacheKey)

		if (!cachedResponse) {
			throw new Error(`Font not found in cache: ${name}`)
		}

		return await cachedResponse.arrayBuffer()
	}

	/**
	 * Check if restoration is currently in progress
	 */
	isRestorationInProgress(): boolean {
		return this.isRestoring
	}

	/**
	 * Wait for any ongoing restoration to complete
	 */
	async waitForRestoration(): Promise<void> {
		if (this.restorationPromise) {
			await this.restorationPromise
		}
	}
}

// Export singleton instance
export const fontRestorationService = FontRestorationService.getInstance()
