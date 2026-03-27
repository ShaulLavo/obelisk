import { createSignal } from 'solid-js'

export interface CleanupResult {
	success: boolean
	itemsRemoved: number
	errors: string[]
	duration: number
}

export interface ResourceStats {
	cacheSize: number
	cacheEntries: number
	indexedDBSize: number
	documentFonts: number
	memoryUsage: number
}

/**
 * Removes old entries from the nerdfonts-v1 Cache API cache based on age.
 * Checks `last-modified` and `date` response headers to determine entry age.
 * Returns the number of entries removed.
 */
export async function removeOldCacheEntries(
	maxAge: number = 7 * 24 * 60 * 60 * 1000
): Promise<number> {
	let itemsRemoved = 0

	if (typeof window === 'undefined' || !('caches' in window)) {
		return itemsRemoved
	}

	const cache = await caches.open('nerdfonts-v1')
	const keys = await cache.keys()
	const now = Date.now()

	for (const request of keys) {
		const response = await cache.match(request)
		if (response) {
			const lastModified = response.headers.get('last-modified')
			const date = response.headers.get('date')

			const timestamp = lastModified
				? new Date(lastModified).getTime()
				: date
					? new Date(date).getTime()
					: now

			if (now - timestamp > maxAge) {
				const deleted = await cache.delete(request)
				if (deleted) {
					itemsRemoved++
				}
			}
		}
	}

	return itemsRemoved
}

/**
 * Comprehensive resource cleanup manager
 */
export class FontResourceCleanup {
	private cleanupInProgress = false
	private cleanupStatusSignal = createSignal<
		'idle' | 'cleaning' | 'complete' | 'error'
	>('idle')
	private cleanupStatus = this.cleanupStatusSignal[0]
	private setCleanupStatus = this.cleanupStatusSignal[1]

	/**
	 * Reset state (for testing purposes only)
	 */
	reset(): void {
		this.cleanupInProgress = false
		this.setCleanupStatus('idle')
	}

	/**
	 * Get current resource usage statistics
	 */
	async getResourceStats(): Promise<ResourceStats> {
		const stats: ResourceStats = {
			cacheSize: 0,
			cacheEntries: 0,
			indexedDBSize: 0,
			documentFonts: 0,
			memoryUsage: 0,
		}

		try {
			// Cache API stats
			if ('caches' in window) {
				const cache = await caches.open('nerdfonts-v1')
				const keys = await cache.keys()
				stats.cacheEntries = keys.length

				// Estimate cache size
				for (const request of keys) {
					const response = await cache.match(request)
					if (response) {
						const blob = await response.blob()
						stats.cacheSize += blob.size
					}
				}
			}

			// Document fonts count
			if (document.fonts) {
				stats.documentFonts = document.fonts.size
			}

			// Memory usage (if available)
			if ('memory' in performance) {
				const memory = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
				stats.memoryUsage = memory.usedJSHeapSize
			}

			// IndexedDB size estimation (approximate)
			stats.indexedDBSize = await this.estimateIndexedDBSize()
		} catch (error) {
			console.debug('[ResourceCleanup] Failed to gather resource stats', error)
		}

		return stats
	}

	/**
	 * Clean up all font-related resources
	 */
	async cleanupAllResources(): Promise<CleanupResult> {
		if (this.cleanupInProgress) {
			throw new Error('Cleanup already in progress')
		}

		this.cleanupInProgress = true
		this.setCleanupStatus('cleaning')

		const startTime = performance.now()
		const result: CleanupResult = {
			success: true,
			itemsRemoved: 0,
			errors: [],
			duration: 0,
		}

		try {
			// 1. Clean up Cache API
			const cacheResult = await this.cleanupCacheAPI()
			result.itemsRemoved += cacheResult.itemsRemoved
			result.errors.push(...cacheResult.errors)

			// 2. Clean up IndexedDB
			const dbResult = await this.cleanupIndexedDB()
			result.itemsRemoved += dbResult.itemsRemoved
			result.errors.push(...dbResult.errors)

			// 3. Clean up document fonts
			const fontResult = await this.cleanupDocumentFonts()
			result.itemsRemoved += fontResult.itemsRemoved
			result.errors.push(...fontResult.errors)

			result.success = result.errors.length === 0
			this.setCleanupStatus(result.success ? 'complete' : 'error')
		} catch (error) {
			result.success = false
			result.errors.push(`Cleanup failed: ${error}`)
			this.setCleanupStatus('error')
		} finally {
			result.duration = performance.now() - startTime
			this.cleanupInProgress = false
		}

		return result
	}

	/**
	 * Clean up specific font resources
	 */
	async cleanupFont(fontName: string): Promise<CleanupResult> {
		const startTime = performance.now()
		const result: CleanupResult = {
			success: true,
			itemsRemoved: 0,
			errors: [],
			duration: 0,
		}

		try {
			// Remove from Cache API
			if ('caches' in window) {
				const cache = await caches.open('nerdfonts-v1')
				const cacheKey = `/fonts/${fontName}`
				const deleted = await cache.delete(cacheKey)
				if (deleted) {
					result.itemsRemoved++
				}
			}

			// Remove from IndexedDB
			const dbDeleted = await this.removeFromIndexedDB(fontName)
			if (dbDeleted) {
				result.itemsRemoved++
			}

			// Remove from document fonts
			const fontRemoved = await this.removeFromDocumentFonts(fontName)
			if (fontRemoved) {
				result.itemsRemoved++
			}
		} catch (error) {
			result.success = false
			result.errors.push(`Failed to cleanup font ${fontName}: ${error}`)
		} finally {
			result.duration = performance.now() - startTime
		}

		return result
	}

	/**
	 * Clean up old/unused resources based on age and usage
	 */
	async cleanupOldResources(
		maxAge: number = 7 * 24 * 60 * 60 * 1000
	): Promise<CleanupResult> {
		const startTime = performance.now()
		const result: CleanupResult = {
			success: true,
			itemsRemoved: 0,
			errors: [],
			duration: 0,
		}

		try {
			// Clean old cache entries
			result.itemsRemoved += await removeOldCacheEntries(maxAge)

			// Clean old IndexedDB entries
			const oldDbEntries = await this.getOldIndexedDBEntries(maxAge)
			for (const entry of oldDbEntries) {
				const deleted = await this.removeFromIndexedDB(entry.name)
				if (deleted) {
					result.itemsRemoved++
				}
			}
		} catch (error) {
			result.success = false
			result.errors.push(`Failed to cleanup old resources: ${error}`)
		} finally {
			result.duration = performance.now() - startTime
		}

		return result
	}

	/**
	 * Verify cleanup was successful
	 */
	async verifyCleanup(): Promise<{
		cacheClean: boolean
		indexedDBClean: boolean
		documentFontsClean: boolean
		totalItems: number
	}> {
		const verification = {
			cacheClean: false,
			indexedDBClean: false,
			documentFontsClean: false,
			totalItems: 0,
		}

		try {
			// Check Cache API
			if ('caches' in window) {
				const cache = await caches.open('nerdfonts-v1')
				const keys = await cache.keys()
				verification.cacheClean = keys.length === 0
				verification.totalItems += keys.length
			} else {
				verification.cacheClean = true
			}

			// Check IndexedDB
			const dbEntries = await this.getAllIndexedDBEntries()
			verification.indexedDBClean = dbEntries.length === 0
			verification.totalItems += dbEntries.length

			// Check document fonts (approximate)
			if (document.fonts) {
				// Count fonts that look like NerdFonts
				let nerdFontCount = 0
				document.fonts.forEach((font) => {
					if (font.family.includes('Nerd') || font.family.includes('Mono')) {
						nerdFontCount++
					}
				})
				verification.documentFontsClean = nerdFontCount === 0
				verification.totalItems += nerdFontCount
			} else {
				verification.documentFontsClean = true
			}
		} catch (error) {
			// Verification is best-effort; return partial results on failure
			console.debug('[ResourceCleanup] Cleanup verification partially failed', error)
		}

		return verification
	}

	/**
	 * Get cleanup status signal
	 */
	getCleanupStatus() {
		return this.cleanupStatus
	}

	// Private methods

	private async cleanupCacheAPI(): Promise<{
		itemsRemoved: number
		errors: string[]
	}> {
		const result = { itemsRemoved: 0, errors: [] as string[] }

		try {
			if ('caches' in window) {
				const cache = await caches.open('nerdfonts-v1')
				const keys = await cache.keys()

				for (const key of keys) {
					const deleted = await cache.delete(key)
					if (deleted) {
						result.itemsRemoved++
					}
				}

				// Also delete the entire cache
				await caches.delete('nerdfonts-v1')
			}
		} catch (error) {
			result.errors.push(`Cache cleanup failed: ${error}`)
		}

		return result
	}

	private async cleanupIndexedDB(): Promise<{
		itemsRemoved: number
		errors: string[]
	}> {
		const result = { itemsRemoved: 0, errors: [] as string[] }

		try {
			// Get all entries first
			const entries = await this.getAllIndexedDBEntries()
			result.itemsRemoved = entries.length

			// Delete the entire database
			const deleteRequest = indexedDB.deleteDatabase('nerdfonts-metadata')
			await new Promise<void>((resolve, reject) => {
				deleteRequest.onsuccess = () => {
					resolve()
				}
				deleteRequest.onerror = () => reject(deleteRequest.error)
				deleteRequest.onblocked = () => {
					setTimeout(() => resolve(), 1000)
				}
			})
		} catch (error) {
			result.errors.push(`IndexedDB cleanup failed: ${error}`)
		}

		return result
	}

	private async cleanupDocumentFonts(): Promise<{
		itemsRemoved: number
		errors: string[]
	}> {
		const result = { itemsRemoved: 0, errors: [] as string[] }

		try {
			if (document.fonts) {
				const fontsToRemove: FontFace[] = []

				document.fonts.forEach((font) => {
					// Remove fonts that look like NerdFonts
					if (
						font.family.includes('Nerd') ||
						font.family.includes('JetBrains') ||
						font.family.includes('Fira') ||
						font.family.includes('Hack') ||
						font.family.includes('Source')
					) {
						fontsToRemove.push(font)
					}
				})

				for (const font of fontsToRemove) {
					document.fonts.delete(font)
					result.itemsRemoved++
				}

				// Clear all fonts if needed
				if (fontsToRemove.length > 0) {
					document.fonts.clear()
				}
			}
		} catch (error) {
			result.errors.push(`Document fonts cleanup failed: ${error}`)
		}

		return result
	}

	private async removeFromIndexedDB(fontName: string): Promise<boolean> {
		try {
			const db = await this.openIndexedDB()
			const transaction = db.transaction(['fonts'], 'readwrite')
			const store = transaction.objectStore('fonts')

			await new Promise<void>((resolve, reject) => {
				const request = store.delete(fontName)
				request.onsuccess = () => resolve()
				request.onerror = () => reject(request.error)
			})

			return true
		} catch (error) {
			console.debug('[ResourceCleanup] Failed to remove font from IndexedDB', fontName, error)
			return false
		}
	}

	private async removeFromDocumentFonts(fontName: string): Promise<boolean> {
		try {
			if (document.fonts) {
				let removed = false
				document.fonts.forEach((font) => {
					if (font.family.includes(fontName)) {
						document.fonts.delete(font)
						removed = true
					}
				})
				return removed
			}
			return false
		} catch (error) {
			console.debug('[ResourceCleanup] Failed to remove document font', fontName, error)
			return false
		}
	}

	private async estimateIndexedDBSize(): Promise<number> {
		try {
			if ('storage' in navigator && 'estimate' in navigator.storage) {
				const estimate = await navigator.storage.estimate()
				return estimate.usage || 0
			}
			return 0
		} catch (error) {
			console.debug('[ResourceCleanup] Failed to estimate IndexedDB size', error)
			return 0
		}
	}

	private async getAllIndexedDBEntries(): Promise<any[]> {
		try {
			const db = await this.openIndexedDB()
			const transaction = db.transaction(['fonts'], 'readonly')
			const store = transaction.objectStore('fonts')

			return new Promise((resolve, reject) => {
				const request = store.getAll()
				request.onsuccess = () => resolve(request.result || [])
				request.onerror = () => reject(request.error)
			})
		} catch (error) {
			console.debug('[ResourceCleanup] Failed to get all IndexedDB entries', error)
			return []
		}
	}

	private async getOldIndexedDBEntries(maxAge: number): Promise<any[]> {
		try {
			const allEntries = await this.getAllIndexedDBEntries()
			const now = Date.now()

			return allEntries.filter((entry) => {
				const lastAccessed = entry.lastAccessed
					? new Date(entry.lastAccessed).getTime()
					: 0
				return now - lastAccessed > maxAge
			})
		} catch (error) {
			console.debug('[ResourceCleanup] Failed to get old IndexedDB entries', error)
			return []
		}
	}

	private async openIndexedDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open('nerdfonts-metadata', 1)
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
	}
}

// Singleton instance
export const fontResourceCleanup = new FontResourceCleanup()

