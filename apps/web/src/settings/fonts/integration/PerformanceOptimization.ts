import { createEffect } from 'solid-js'
import type { FontRegistryActions } from '../../../fonts/types'

interface FontDebugWindow extends Window {
	fontDebug?: {
		triggerCleanup: () => Promise<void>
	}
	gc?: () => void
}

export interface OptimizationConfig {
	enablePerformanceMonitoring: boolean
	enableMemoryMonitoring: boolean
	maxConcurrentDownloads: number
	debugMode: boolean
}

const DEFAULT_CONFIG: OptimizationConfig = {
	enablePerformanceMonitoring: true,
	enableMemoryMonitoring: true,
	maxConcurrentDownloads: 3,
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
 * Queue a download with bounded concurrency.
 *
 * Runs `downloadFn` immediately if the active count is below `maxConcurrent`,
 * otherwise enqueues it and resolves when it eventually completes.
 */
export function queueDownload(
	_name: string,
	downloadFn: () => Promise<void>,
	maxConcurrent: number = DEFAULT_CONFIG.maxConcurrentDownloads
): Promise<void> {
	return fontDownloadQueue.enqueue(downloadFn, maxConcurrent)
}

/** Shared mutable state backing `queueDownload`. */
const fontDownloadQueue = {
	active: 0,
	pending: [] as Array<() => Promise<void>>,

	async enqueue(
		downloadFn: () => Promise<void>,
		maxConcurrent: number
	): Promise<void> {
		if (this.active < maxConcurrent) {
			this.active++
			try {
				await downloadFn()
			} finally {
				this.active--
				const next = this.pending.shift()
				if (next) {
					this.active++
					void next().finally(() => {
						this.active--
					})
				}
			}
		} else {
			await new Promise<void>((resolve, reject) => {
				this.pending.push(() => downloadFn().then(resolve, reject))
			})
		}
	},
}

/**
 * Main performance optimization controller
 */
export class FontPerformanceOptimizer {
	private config: OptimizationConfig
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

	async optimizedFontDownload(
		fontName: string,
		downloadFn: () => Promise<void>
	): Promise<void> {
		await queueDownload(fontName, downloadFn, this.config.maxConcurrentDownloads)
	}

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
