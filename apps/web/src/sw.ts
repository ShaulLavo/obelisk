/**
 * Service Worker for NerdFonts Caching
 *
 * This service worker provides offline font serving capabilities by intercepting
 * font requests and serving them from the Cache API when available.
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = 'nerdfonts-v1'
const FONT_CACHE_VERSION = '1.0'

// Font URL patterns to intercept
// IMPORTANT: Only match actual font requests, not JS module imports
// We only intercept /api/fonts/* requests
const FONT_URL_PATTERNS = [/\/api\/fonts\/[^/]+$/]

// Cache key pattern (for matching cached responses, not intercepting)
const FONT_CACHE_KEY_PATTERN = /^\/fonts\/[^/]+$/

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
	console.log('[SW] Installing service worker for font caching')

	event.waitUntil(
		caches.open(CACHE_NAME).then(() => {
			console.log('[SW] Font cache opened successfully')
			return Promise.resolve()
		})
	)

	// Skip waiting to activate immediately
	self.skipWaiting()
})

/**
 * Service Worker Activation
 */
self.addEventListener('activate', (event) => {
	console.log('[SW] Activating service worker for font caching')

	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames.map((cacheName) => {
						if (
							cacheName.startsWith('nerdfonts-') &&
							cacheName !== CACHE_NAME
						) {
							console.log('[SW] Deleting old cache:', cacheName)
							return caches.delete(cacheName)
						}
						return undefined
					})
				)
			})
			.then(() => {
				return self.clients.claim()
			})
	)
})

/**
 * Fetch Event Handler - Font Caching Strategy
 */
self.addEventListener('fetch', (event) => {
	const request = event.request
	const url = new URL(request.url)

	if (!isFontRequest(url)) {
		return
	}

	console.log('[SW] Intercepting font request:', url.pathname)
	event.respondWith(handleFontRequest(request))
})

/**
 * Check if the request is for a font (API request only)
 */
function isFontRequest(url: URL): boolean {
	if (/\.(js|ts|tsx|mjs|jsx)(\?|$)/.test(url.pathname)) {
		return false
	}
	return FONT_URL_PATTERNS.some((pattern) => pattern.test(url.pathname))
}

/**
 * Check if a URL matches the font cache key pattern
 */
function isFontCacheKey(url: URL): boolean {
	return FONT_CACHE_KEY_PATTERN.test(url.pathname)
}

/**
 * Handle font requests with cache-first strategy
 */
async function handleFontRequest(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE_NAME)
	const url = new URL(request.url)
	const fontName = extractFontName(url.pathname)
	const cacheKey = `/fonts/${fontName}`

	try {
		const cachedResponse = await cache.match(cacheKey)
		if (cachedResponse) {
			console.log('[SW] Serving font from cache:', fontName)
			updateFontAccessTime(fontName).catch((err) => {
				console.warn('[SW] Failed to update access time:', err)
			})
			return cachedResponse
		}

		console.log('[SW] Font not in cache, fetching from network:', fontName)
		const networkResponse = await fetch(request)

		if (networkResponse.ok) {
			const responseToCache = networkResponse.clone()
			const fontData = await responseToCache.arrayBuffer()

			const cachedResp = new Response(fontData, {
				status: networkResponse.status,
				statusText: networkResponse.statusText,
				headers: {
					'Content-Type': 'font/ttf',
					'Cache-Control': 'public, max-age=31536000, immutable',
					'X-Font-Cached': 'true',
					'X-Cache-Version': FONT_CACHE_VERSION,
				},
			})

			await cache.put(cacheKey, cachedResp.clone())
			console.log('[SW] Font cached successfully:', fontName)

			storeFontMetadata(fontName, {
				cachedAt: new Date().toISOString(),
				size: fontData.byteLength,
				version: FONT_CACHE_VERSION,
			}).catch((err) => {
				console.warn('[SW] Failed to store metadata:', err)
			})

			return cachedResp
		} else {
			console.error(
				'[SW] Network request failed:',
				networkResponse.status,
				networkResponse.statusText
			)
			throw new Error(`Network request failed: ${networkResponse.status}`)
		}
	} catch (error) {
		console.error('[SW] Error handling font request:', error)

		const staleResponse = await cache.match(cacheKey)
		if (staleResponse) {
			console.log('[SW] Serving stale font from cache due to error:', fontName)
			return staleResponse
		}

		return new Response('Font not available offline', {
			status: 503,
			statusText: 'Service Unavailable',
			headers: { 'Content-Type': 'text/plain' },
		})
	}
}

/**
 * Extract font name from URL path
 */
function extractFontName(pathname: string): string {
	const match =
		pathname.match(/\/fonts\/([^/]+)$/) ||
		pathname.match(/\/api\/fonts\/([^/]+)$/)
	return match ? match[1] : (pathname.split('/').pop() ?? '')
}

/**
 * Update font access time via message to main thread
 */
async function updateFontAccessTime(fontName: string): Promise<void> {
	const clients = await self.clients.matchAll()
	clients.forEach((client) => {
		client.postMessage({
			type: 'FONT_ACCESSED',
			fontName,
			timestamp: new Date().toISOString(),
		})
	})
}

/**
 * Store font metadata via message to main thread
 */
async function storeFontMetadata(
	fontName: string,
	metadata: { cachedAt: string; size: number; version: string }
): Promise<void> {
	const clients = await self.clients.matchAll()
	clients.forEach((client) => {
		client.postMessage({
			type: 'STORE_FONT_METADATA',
			fontName,
			metadata,
		})
	})
}

/**
 * Message handler for communication with main thread
 */
self.addEventListener('message', (event) => {
	const { type, data } = event.data as { type: string; data?: unknown }

	switch (type) {
		case 'GET_CACHE_STATS':
			handleGetCacheStats()
				.then((stats) => {
					event.ports[0]?.postMessage({ type: 'CACHE_STATS', data: stats })
				})
				.catch((error: Error) => {
					event.ports[0]?.postMessage({ type: 'ERROR', error: error.message })
				})
			break

		case 'CLEANUP_CACHE':
			handleCacheCleanup(data as { maxSize?: number } | undefined)
				.then((result) => {
					event.ports[0]?.postMessage({ type: 'CLEANUP_RESULT', data: result })
				})
				.catch((error: Error) => {
					event.ports[0]?.postMessage({ type: 'ERROR', error: error.message })
				})
			break

		case 'CLEAR_FONT_CACHE':
			handleClearFontCache((data as { fontName?: string })?.fontName)
				.then((result) => {
					event.ports[0]?.postMessage({ type: 'CLEAR_RESULT', data: result })
				})
				.catch((error: Error) => {
					event.ports[0]?.postMessage({ type: 'ERROR', error: error.message })
				})
			break

		default:
			console.warn('[SW] Unknown message type:', type)
	}
})

/**
 * Get cache statistics
 */
async function handleGetCacheStats(): Promise<{
	fontCount: number
	totalSize: number
	cacheVersion: string
	lastUpdated: string
}> {
	const cache = await caches.open(CACHE_NAME)
	const keys = await cache.keys()
	const fontKeys = keys.filter((request) =>
		isFontCacheKey(new URL(request.url))
	)

	let totalSize = 0
	for (const key of fontKeys) {
		const response = await cache.match(key)
		if (response) {
			const arrayBuffer = await response.arrayBuffer()
			totalSize += arrayBuffer.byteLength
		}
	}

	return {
		fontCount: fontKeys.length,
		totalSize,
		cacheVersion: FONT_CACHE_VERSION,
		lastUpdated: new Date().toISOString(),
	}
}

/**
 * Handle cache cleanup
 */
async function handleCacheCleanup(options?: { maxSize?: number }): Promise<{
	cleaned: boolean
	reason?: string
	removedCount?: number
	newStats?: Awaited<ReturnType<typeof handleGetCacheStats>>
}> {
	const cache = await caches.open(CACHE_NAME)
	const keys = await cache.keys()
	const fontKeys = keys.filter((request) =>
		isFontCacheKey(new URL(request.url))
	)

	const maxSize = options?.maxSize ?? 100 * 1024 * 1024 // 100MB default
	const stats = await handleGetCacheStats()

	if (stats.totalSize <= maxSize) {
		return { cleaned: false, reason: 'Cache size within limits' }
	}

	const toRemove = Math.ceil(fontKeys.length * 0.2)
	const keysToRemove = fontKeys.slice(0, toRemove)

	for (const key of keysToRemove) {
		await cache.delete(key)
	}

	return {
		cleaned: true,
		removedCount: keysToRemove.length,
		newStats: await handleGetCacheStats(),
	}
}

/**
 * Clear specific font or all fonts from cache
 */
async function handleClearFontCache(fontName?: string): Promise<{
	cleared: boolean
	fontName?: string
	clearedCount?: number
}> {
	const cache = await caches.open(CACHE_NAME)

	if (fontName) {
		const cacheKey = `/fonts/${fontName}`
		const deleted = await cache.delete(cacheKey)
		return { cleared: deleted, fontName }
	}

	const keys = await cache.keys()
	const fontKeys = keys.filter((request) =>
		isFontCacheKey(new URL(request.url))
	)

	let clearedCount = 0
	for (const key of fontKeys) {
		const deleted = await cache.delete(key)
		if (deleted) clearedCount++
	}

	return { cleared: clearedCount > 0, clearedCount }
}

console.log('[SW] Service worker script loaded')
