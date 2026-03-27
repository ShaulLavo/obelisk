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
	private messageHandlers = new Map<string, (data: unknown) => void>()

	async init(): Promise<void> {
		if (!('serviceWorker' in navigator)) {
			return
		}

		if (this.isRegistered) {
			return
		}

		this.registration = await navigator.serviceWorker.register('/sw.js', {
			scope: '/',
		})

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
	}

	isSupported(): boolean {
		return 'serviceWorker' in navigator && this.isRegistered
	}

	async getCacheStats(): Promise<ServiceWorkerCacheStats> {
		if (!this.isSupported()) {
			throw new Error('Service worker not available')
		}

		return this.sendMessage<ServiceWorkerCacheStats>('GET_CACHE_STATS')
	}

	async cleanupCache(options?: {
		maxSize?: number
	}): Promise<ServiceWorkerCleanupResult> {
		if (!this.isSupported()) {
			throw new Error('Service worker not available')
		}

		return this.sendMessage<ServiceWorkerCleanupResult>('CLEANUP_CACHE', options)
	}

	async clearFontCache(fontName?: string): Promise<ServiceWorkerClearResult> {
		if (!this.isSupported()) {
			throw new Error('Service worker not available')
		}

		return this.sendMessage<ServiceWorkerClearResult>('CLEAR_FONT_CACHE', { fontName })
	}

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
		} catch {
			return []
		}
	}

	onMessage(type: string, handler: (data: unknown) => void): void {
		this.messageHandlers.set(type, handler)
	}

	offMessage(type: string): void {
		this.messageHandlers.delete(type)
	}

	private async sendMessage<T = unknown>(type: string, data?: unknown): Promise<T> {
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
			// Last-accessed update is best-effort; non-critical
			console.debug('[ServiceWorkerManager] Failed to update lastAccessed for', fontName, error)
		}
	}

	/**
	 * Handle metadata storage request from service worker
	 */
	private async handleStoreMetadata(
		fontName: string,
		metadata: { cachedAt: string | number; size: number; version: string }
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
			// Metadata storage from SW is best-effort; non-critical
			console.debug('[ServiceWorkerManager] Failed to store font metadata from SW', error)
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

		await this.registration.update()
	}

	/**
	 * Unregister service worker (for cleanup/testing)
	 */
	async unregister(): Promise<void> {
		if (!this.registration) {
			return
		}

		await this.registration.unregister()
		this.registration = null
		this.isRegistered = false
	}
}

export const serviceWorkerManager = new ServiceWorkerManager()
