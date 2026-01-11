/**
 * Resource Cleanup Utilities
 *
 * Comprehensive resource management and cleanup for font operations.
 * Ensures proper cleanup of caches, IndexedDB, document fonts, and memory.
 */

import { createSignal, onCleanup } from 'solid-js'

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
 * Comprehensive resource cleanup manager
 */
export class FontResourceCleanup {
	private static instance: FontResourceCleanup
	private cleanupInProgress = false
	private cleanupStatusSignal = createSignal<
		'idle' | 'cleaning' | 'complete' | 'error'
	>('idle')
	private cleanupStatus = this.cleanupStatusSignal[0]
	private setCleanupStatus = this.cleanupStatusSignal[1]

	static getInstance(): FontResourceCleanup {
		if (!FontResourceCleanup.instance) {
			FontResourceCleanup.instance = new FontResourceCleanup()
		}
		return FontResourceCleanup.instance
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
				const memory = (performance as any).memory
				stats.memoryUsage = memory.usedJSHeapSize
			}

			// IndexedDB size estimation (approximate)
			stats.indexedDBSize = await this.estimateIndexedDBSize()
		} catch (error) {
			console.warn('Failed to get resource stats:', error)
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

			// 4. Force garbage collection if available
			await this.forceGarbageCollection()

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
			const now = Date.now()

			// Clean old cache entries
			if ('caches' in window) {
				const cache = await caches.open('nerdfonts-v1')
				const keys = await cache.keys()

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
								result.itemsRemoved++
								console.log(`🗑️ Cleaned up old font cache: ${request.url}`)
							}
						}
					}
				}
			}

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
			console.error('Failed to verify cleanup:', error)
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
				const cacheDeleted = await caches.delete('nerdfonts-v1')
				if (cacheDeleted) {
					console.log('✅ Font cache deleted successfully')
				}
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
					console.log('✅ Font metadata database deleted successfully')
					resolve()
				}
				deleteRequest.onerror = () => reject(deleteRequest.error)
				deleteRequest.onblocked = () => {
					console.warn('⚠️ Database deletion blocked, will retry')
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
					console.log('✅ Document fonts cleared')
				}
			}
		} catch (error) {
			result.errors.push(`Document fonts cleanup failed: ${error}`)
		}

		return result
	}

	private async forceGarbageCollection(): Promise<void> {
		try {
			// Force garbage collection if available
			if ('gc' in window && typeof (window as any).gc === 'function') {
				;(window as any).gc()
				console.log('🗑️ Forced garbage collection')
			}

			// Alternative: create memory pressure to trigger GC
			const memoryPressure = new Array(1000000).fill(0)
			memoryPressure.length = 0
		} catch (error) {
			console.warn('Failed to force garbage collection:', error)
		}
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
			console.error(`Failed to remove ${fontName} from IndexedDB:`, error)
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
			console.error(`Failed to remove ${fontName} from document fonts:`, error)
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

/**
 * Hook for using font resource cleanup
 */
export function useFontResourceCleanup() {
	const cleanup = FontResourceCleanup.getInstance()

	// Cleanup on component unmount
	onCleanup(async () => {
		// Optional: Clean up old resources on unmount
		if (import.meta.env.DEV) {
			console.log('🧹 Component unmounted, checking for old resources...')
			const result = await cleanup.cleanupOldResources()
			if (result.itemsRemoved > 0) {
				console.log(`🗑️ Cleaned up ${result.itemsRemoved} old resources`)
			}
		}
	})

	return {
		getResourceStats: () => cleanup.getResourceStats(),
		cleanupAllResources: () => cleanup.cleanupAllResources(),
		cleanupFont: (fontName: string) => cleanup.cleanupFont(fontName),
		cleanupOldResources: (maxAge?: number) =>
			cleanup.cleanupOldResources(maxAge),
		verifyCleanup: () => cleanup.verifyCleanup(),
		getCleanupStatus: () => cleanup.getCleanupStatus(),
	}
}

/**
 * Automatic cleanup scheduler
 */
export class AutoCleanupScheduler {
	private static instance: AutoCleanupScheduler
	private intervalId?: number
	private isRunning = false

	static getInstance(): AutoCleanupScheduler {
		if (!AutoCleanupScheduler.instance) {
			AutoCleanupScheduler.instance = new AutoCleanupScheduler()
		}
		return AutoCleanupScheduler.instance
	}

	/**
	 * Start automatic cleanup every interval
	 */
	start(intervalMs: number = 24 * 60 * 60 * 1000): void {
		// Default: 24 hours
		if (this.isRunning) return

		this.isRunning = true
		this.intervalId = window.setInterval(async () => {
			console.log('🔄 Running scheduled font cleanup...')

			const cleanup = FontResourceCleanup.getInstance()
			const result = await cleanup.cleanupOldResources()

			if (result.itemsRemoved > 0) {
				console.log(
					`✅ Scheduled cleanup removed ${result.itemsRemoved} old resources`
				)
			}
		}, intervalMs)

		console.log(
			`⏰ Automatic font cleanup scheduled every ${intervalMs / 1000 / 60} minutes`
		)
	}

	/**
	 * Stop automatic cleanup
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = undefined
		}
		this.isRunning = false
		console.log('⏹️ Automatic font cleanup stopped')
	}

	/**
	 * Check if scheduler is running
	 */
	isSchedulerRunning(): boolean {
		return this.isRunning
	}
}
