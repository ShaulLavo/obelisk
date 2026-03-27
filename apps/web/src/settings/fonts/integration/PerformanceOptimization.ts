import { createEffect } from 'solid-js'
import type { FontRegistryActions } from '../../../fonts/types'

interface FontDebugWindow extends Window {
	fontDebug?: {
		triggerCleanup: () => Promise<void>
	}
	gc?: () => void
}

export interface OptimizationConfig {
	enableLazyLoading: boolean
	enablePerformanceMonitoring: boolean
	enableMemoryMonitoring: boolean
	maxConcurrentDownloads: number
	preloadPopularFonts: boolean
	debugMode: boolean
}

const DEFAULT_CONFIG: OptimizationConfig = {
	enableLazyLoading: true,
	enablePerformanceMonitoring: true,
	enableMemoryMonitoring: true,
	maxConcurrentDownloads: 3,
	preloadPopularFonts: true,
	debugMode: false,
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MEMORY_PRESSURE_THRESHOLD = 80

/** Returns memory usage as a percentage, or 0 if the API is unavailable. */
function getMemoryUsagePercentage(): number {
	const perf = performance as Performance & {
		memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
	}
	if (!perf.memory) return 0
	return (perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100
}

/**
 * Main performance optimization controller
 */
export class FontPerformanceOptimizer {
	private config: OptimizationConfig
	private downloadQueue: Array<() => Promise<void>> = []
	private activeDownloads = 0
	private _initialized = false

	constructor(config: Partial<OptimizationConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	/**
	 * Initialize the optimizer. Must be called within a reactive owner
	 * (e.g. inside a component or createRoot) so that createEffect works.
	 */
	init(): void {
		if (this._initialized) return
		this._initialized = true
		this.initialize()
	}

	/**
	 * Reset state (for testing purposes only)
	 */
	reset(): void {
		this.cleanup()
	}

	private initialize(): void {
		if (this.config.enableMemoryMonitoring) {
			this.setupMemoryMonitoring()
		}

		if (this.config.debugMode) {
			this.enableDebugMode()
		}

		// Setup cleanup on page unload (only in browser environment)
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', () => {
				this.cleanup()
			})
		}
	}

	private setupMemoryMonitoring(): void {
		createEffect(() => {
			const memoryUsage = getMemoryUsagePercentage()
			if (memoryUsage > MEMORY_PRESSURE_THRESHOLD) {
				void this.triggerMemoryCleanup()
			}
		})
	}

	private enableDebugMode(): void {
		const w = window as FontDebugWindow
		w.fontDebug = {
			triggerCleanup: () => this.triggerMemoryCleanup(),
		}
	}

	private async queueDownload(
		_fontName: string,
		downloadFn: () => Promise<void>
	): Promise<void> {
		if (this.activeDownloads < this.config.maxConcurrentDownloads) {
			this.activeDownloads++
			try {
				await downloadFn()
			} finally {
				this.activeDownloads--
				const next = this.downloadQueue.shift()
				if (next) {
					this.activeDownloads++
					void next().finally(() => {
						this.activeDownloads--
					})
				}
			}
		} else {
			await new Promise<void>((resolve, reject) => {
				this.downloadQueue.push(() => downloadFn().then(resolve, reject))
			})
		}
	}

	async optimizedFontDownload(
		fontName: string,
		downloadFn: () => Promise<void>
	): Promise<void> {
		await this.queueDownload(fontName, downloadFn)
	}

	/**
	 * Trigger memory cleanup when usage is high
	 */
	private async triggerMemoryCleanup(): Promise<void> {
		try {
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()
			const oneWeekAgo = Date.now() - ONE_WEEK_MS
			for (const request of keys) {
				const response = await cache.match(request)
				const dateHeader = response?.headers.get('date')
				if (dateHeader && new Date(dateHeader).getTime() < oneWeekAgo) {
					await cache.delete(request)
				}
			}

			const w = window as FontDebugWindow
			if (typeof w.gc === 'function') {
				w.gc()
			}
		} catch (error) {
			console.warn('[FontPerformanceOptimizer] Memory cleanup failed', error)
		}
	}

	getOptimizationStatus(): {
		config: OptimizationConfig
		memoryUsage: number
		isHealthy: boolean
	} {
		const memoryUsage = getMemoryUsagePercentage()

		return {
			config: this.config,
			memoryUsage,
			isHealthy: memoryUsage < MEMORY_PRESSURE_THRESHOLD,
		}
	}

	updateConfig(newConfig: Partial<OptimizationConfig>): void {
		this.config = { ...this.config, ...newConfig }
	}

	cleanup(): void {
		const w = window as FontDebugWindow
		if (w.fontDebug) {
			delete w.fontDebug
		}
	}
}

/** Lazy singleton -- created on first access, not at import time. */
let _fontPerformanceOptimizer: FontPerformanceOptimizer | null = null
export function getFontPerformanceOptimizer(): FontPerformanceOptimizer {
	if (!_fontPerformanceOptimizer) {
		_fontPerformanceOptimizer = new FontPerformanceOptimizer()
	}
	return _fontPerformanceOptimizer
}

/**
 * @deprecated Use getFontPerformanceOptimizer() instead.
 * Kept for backward-compatibility; resolves to the same lazy singleton.
 */
export const fontPerformanceOptimizer = new Proxy(
	{} as FontPerformanceOptimizer,
	{
		get(_target, prop, receiver) {
			return Reflect.get(getFontPerformanceOptimizer(), prop, receiver)
		},
	}
)

/**
 * Performance-optimized font registry wrapper
 */
export function createOptimizedFontRegistry(
	originalRegistry: FontRegistryActions,
	config?: Partial<OptimizationConfig>
) {
	const optimizer = getFontPerformanceOptimizer()
	if (config) {
		optimizer.updateConfig(config)
	}

	return {
		...originalRegistry,

		downloadFont: async (fontName: string) => {
			await optimizer.optimizedFontDownload(fontName, async () => {
				await originalRegistry.downloadFont(fontName)
			})
		},

		getOptimizationStatus: () => optimizer.getOptimizationStatus(),
	}
}

/**
 * Resource cleanup utilities
 */
export const ResourceCleanup = {
	async cleanupFontResources(): Promise<void> {
		try {
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()

			for (const key of keys) {
				await cache.delete(key)
			}

			const dbRequest = indexedDB.deleteDatabase('nerdfonts-metadata')
			await new Promise((resolve, reject) => {
				dbRequest.onsuccess = () => resolve(undefined)
				dbRequest.onerror = () => reject(dbRequest.error)
			})

			if (document.fonts) {
				document.fonts.clear()
			}
		} catch (error) {
			console.warn('[ResourceCleanup] Font resource cleanup failed', error)
		}
	},

	async verifyCleanup(): Promise<boolean> {
		try {
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()
			return keys.length === 0
		} catch {
			return false
		}
	},
}
