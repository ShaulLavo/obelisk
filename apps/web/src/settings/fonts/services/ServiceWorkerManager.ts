/**
 * Service Worker Manager for Font Caching
 *
 * Handles service worker registration, communication, and provides
 * an interface for the main thread to interact with the service worker.
 */

export interface ServiceWorkerCacheStats {
	fontCount: number
	totalSize: number
	cacheVersion: string
	lastUpdated: string
}

export interface ServiceWorkerCleanupResult {
	cleaned: boolean
	reason?: string
	removedCount?: number
	newStats?: ServiceWorkerCacheStats
}

export interface ServiceWorkerClearResult {
	cleared: boolean
	fontName?: string
	clearedCount?: number
}

export class ServiceWorkerManager {
	private registration: ServiceWorkerRegistration | null = null
	private isRegistered = false
	private messageHandlers = new Map<string, (data: any) => void>()

	/**
	 * Initialize and register the service worker
	 */
	async init(): Promise<void> {
		if (!('serviceWorker' in navigator)) {
			console.warn('[ServiceWorkerManager] Service Worker not supported')
			return
		}

		if (this.isRegistered) {
			return
		}

		try {
			this.registration = await navigator.serviceWorker.register('/sw.js', {
				scope: '/',
			})

			this.isRegistered = true

			this.isRegistered = true

			navigator.serviceWorker.addEventListener(
				'message',
				this.handleServiceWorkerMessage.bind(this)
			)

			this.registration.addEventListener('updatefound', () => {
				const newWorker = this.registration!.installing

				if (newWorker) {
					newWorker.addEventListener('statechange', () => {
						if (
							newWorker.state === 'installed' &&
							navigator.serviceWorker.controller
						) {
							this.notifyServiceWorkerUpdate()
						}
					})
				}
			})
		} catch (error) {
			console.error(
				'[ServiceWorkerManager] Failed to register service worker:',
				error
			)
			throw error
		}
	}

	/**
	 * Check if service worker is supported and registered
	 */
	isSupported(): boolean {
		return 'serviceWorker' in navigator && this.isRegistered
	}

	/**
	 * Get cache statistics from service worker
	 */
	async getCacheStats(): Promise<ServiceWorkerCacheStats> {
		if (!this.isSupported()) {
			throw new Error('Service worker not available')
		}

		return this.sendMessage('GET_CACHE_STATS')
	}

	/**
	 * Request cache cleanup from service worker
	 */
	async cleanupCache(options?: {
		maxSize?: number
	}): Promise<ServiceWorkerCleanupResult> {
		if (!this.isSupported()) {
			throw new Error('Service worker not available')
		}

		return this.sendMessage('CLEANUP_CACHE', options)
	}

	/**
	 * Clear specific font or all fonts from service worker cache
	 */
	async clearFontCache(fontName?: string): Promise<ServiceWorkerClearResult> {
		if (!this.isSupported()) {
			throw new Error('Service worker not available')
		}

		return this.sendMessage('CLEAR_FONT_CACHE', { fontName })
	}

	/**
	 * Get cache manifest for offline availability
	 */
	async getCacheManifest(): Promise<string[]> {
		if (!this.isSupported()) {
			return []
		}

		try {
			await this.getCacheStats()
			// Return list of cached font URLs
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()

			return keys
				.filter((request) => this.isFontRequest(new URL(request.url)))
				.map((request) => request.url)
		} catch (error) {
			console.error(
				'[ServiceWorkerManager] Failed to get cache manifest:',
				error
			)
			return []
		}
	}

	/**
	 * Register a message handler for service worker messages
	 */
	onMessage(type: string, handler: (data: any) => void): void {
		this.messageHandlers.set(type, handler)
	}

	/**
	 * Remove a message handler
	 */
	offMessage(type: string): void {
		this.messageHandlers.delete(type)
	}

	/**
	 * Send a message to the service worker and wait for response
	 */
	private async sendMessage(type: string, data?: any): Promise<any> {
		if (!this.registration || !this.registration.active) {
			throw new Error('Service worker not active')
		}

		return new Promise((resolve, reject) => {
			const messageChannel = new MessageChannel()

			messageChannel.port1.onmessage = (event) => {
				const { data: responseData, error } = event.data

				if (error) {
					reject(new Error(error))
				} else {
					resolve(responseData)
				}
			}

			this.registration!.active!.postMessage({ type, data }, [
				messageChannel.port2,
			])

			// Timeout after 10 seconds
			setTimeout(() => {
				reject(new Error('Service worker message timeout'))
			}, 10000)
		})
	}

	/**
	 * Handle messages from service worker
	 */
	private handleServiceWorkerMessage(event: MessageEvent): void {
		const { type, fontName, metadata } = event.data

		switch (type) {
			case 'FONT_ACCESSED':
				this.handleFontAccessed(fontName)
				break

			case 'STORE_FONT_METADATA':
				this.handleStoreMetadata(fontName, metadata)
				break

			default: {
				const handler = this.messageHandlers.get(type)
				if (handler) {
					handler(event.data)
				}
			}
		}
	}

	/**
	 * Handle font accessed notification from service worker
	 */
	private async handleFontAccessed(fontName: string): Promise<void> {
		try {
			const { fontMetadataService } = await import('./FontMetadataService')
			await fontMetadataService.updateLastAccessed(fontName)
		} catch (error) {
			console.warn(
				'[ServiceWorkerManager] Failed to update font access time:',
				error
			)
		}
	}

	/**
	 * Handle metadata storage request from service worker
	 */
	private async handleStoreMetadata(
		fontName: string,
		metadata: any
	): Promise<void> {
		try {
			const { fontMetadataService } = await import('./FontMetadataService')

			const fontMetadata = {
				name: fontName,
				downloadUrl: '', // Not available from service worker
				installedAt: new Date(metadata.cachedAt),
				size: metadata.size,
				version: metadata.version,
				lastAccessed: new Date(metadata.cachedAt),
			}

			await fontMetadataService.storeFontMetadata(fontMetadata)
		} catch (error) {
			console.warn(
				'[ServiceWorkerManager] Failed to store font metadata:',
				error
			)
		}
	}

	/**
	 * Check if URL is a font request (cache key pattern)
	 */
	private isFontRequest(url: URL): boolean {
		// Only match cache keys: /fonts/{fontName}
		return /^\/fonts\/[^/]+$/.test(url.pathname)
	}

	/**
	 * Notify about service worker updates
	 */
	private notifyServiceWorkerUpdate(): void {
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('service-worker-update', {
					detail: {
						message:
							'A new version of the font cache is available. Refresh to update.',
					},
				})
			)
		}
	}

	/**
	 * Force service worker update
	 */
	async forceUpdate(): Promise<void> {
		if (!this.registration) {
			throw new Error('Service worker not registered')
		}

		try {
			await this.registration.update()
		} catch (error) {
			console.error(
				'[ServiceWorkerManager] Failed to update service worker:',
				error
			)
			throw error
		}
	}

	/**
	 * Unregister service worker (for cleanup/testing)
	 */
	async unregister(): Promise<void> {
		if (!this.registration) {
			return
		}

		try {
			await this.registration.unregister()
			this.registration = null
			this.isRegistered = false
		} catch (error) {
			console.error(
				'[ServiceWorkerManager] Failed to unregister service worker:',
				error
			)
			throw error
		}
	}
}

export const serviceWorkerManager = new ServiceWorkerManager()
