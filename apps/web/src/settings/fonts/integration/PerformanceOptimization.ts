/**
 * Performance Optimization Integration
 *
 * Integrates all performance optimizations for the font management system:
 * - Lazy loading
 * - Performance monitoring
 * - Memory management
 * - Caching strategies
 * - Resource cleanup
 */

import { createEffect, createSignal, onCleanup } from 'solid-js'
import {
	usePerformanceMonitor,
	FontLoadingOptimizer,
	createMemoryMonitor,
	PerformanceDebugger,
} from '../utils/performanceMonitoring'
import { removeOldCacheEntries } from '../utils/resourceCleanup'
import type { FontRegistryActions } from '../../../fonts/types'

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
const DEBUG_MONITORING_INTERVAL_MS = 30_000
const MEMORY_PRESSURE_THRESHOLD = 80
const MIN_HEALTHY_CACHE_HIT_RATE = 0.5

/**
 * Main performance optimization controller
 */
export class FontPerformanceOptimizer {
	private config: OptimizationConfig
	private performanceMonitor = usePerformanceMonitor()
	private memoryMonitor = createMemoryMonitor()
	private debugInterval?: () => void

	constructor(config: Partial<OptimizationConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.initialize()
	}

	/**
	 * Reset state (for testing purposes only)
	 */
	reset(): void {
		this.cleanup()
	}

	private initialize(): void {
		if (this.config.enablePerformanceMonitoring) {
			this.setupPerformanceMonitoring()
		}

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

	private setupPerformanceMonitoring(): void {
		// Monitor font loading performance
		// Log performance metrics every 30 seconds in debug mode
		if (this.config.debugMode) {
			this.debugInterval = PerformanceDebugger.startContinuousMonitoring(DEBUG_MONITORING_INTERVAL_MS)
		}
	}

	private setupMemoryMonitoring(): void {
		// Monitor memory usage and warn if it gets too high
		createEffect(() => {
			const memoryUsage = this.memoryMonitor.memoryUsagePercentage()

			if (memoryUsage > MEMORY_PRESSURE_THRESHOLD) {
				this.triggerMemoryCleanup()
			}
		})
	}

	private enableDebugMode(): void {
		// Add global debug functions
		;(window as any).fontDebug = {
			getMetrics: () => this.performanceMonitor.getMetrics(),
			getReport: () => this.performanceMonitor.getPerformanceReport(),
			exportMetrics: () => PerformanceDebugger.exportMetrics(),
			clearMetrics: () => this.performanceMonitor.clearMetrics(),
			getMemoryInfo: () => this.memoryMonitor.memoryInfo(),
			triggerCleanup: () => this.triggerMemoryCleanup(),
		}

	}

	/** Run an operation with optional performance tracking bookends. */
	private async withMonitoring<T>(
		operation: () => Promise<T>,
		onStart: () => void,
		onComplete: (result: T) => void
	): Promise<T> {
		if (this.config.enablePerformanceMonitoring) onStart()
		const result = await operation()
		if (this.config.enablePerformanceMonitoring) onComplete(result)
		return result
	}

	/**
	 * Optimize font download with performance tracking
	 */
	async optimizedFontDownload(
		fontName: string,
		downloadFn: () => Promise<void>
	): Promise<void> {
		await this.withMonitoring(
			() => FontLoadingOptimizer.queueFontDownload(fontName, downloadFn),
			() => this.performanceMonitor.startFontDownload(fontName),
			() => this.performanceMonitor.completeFontDownload(fontName, false)
		)
	}

	/**
	 * Optimize font installation with performance tracking
	 */
	async optimizedFontInstallation(
		fontName: string,
		installFn: () => Promise<number>
	): Promise<void> {
		await this.withMonitoring(
			installFn,
			() => this.performanceMonitor.startFontInstallation(fontName),
			(size) => this.performanceMonitor.completeFontInstallation(fontName, size)
		)
	}

	/**
	 * Preload popular fonts for better UX
	 */
	preloadPopularFonts(fontNames: string[]): void {
		if (!this.config.preloadPopularFonts) return

		FontLoadingOptimizer.preloadPopularFonts(fontNames)
	}

	/**
	 * Trigger memory cleanup when usage is high
	 */
	private async triggerMemoryCleanup(): Promise<void> {
		try {
			await removeOldCacheEntries(ONE_WEEK_MS)

			// Force garbage collection if available
			if ('gc' in window && typeof (window as any).gc === 'function') {
				;(window as any).gc()
			}

		} catch (error) {
			console.warn('[FontPerformanceOptimizer] Memory cleanup failed', error)
		}
	}

	/**
	 * Get current optimization status
	 */
	getOptimizationStatus(): {
		config: OptimizationConfig
		metrics: ReturnType<ReturnType<typeof usePerformanceMonitor>['getMetrics']>
		memoryUsage: number
		isHealthy: boolean
	} {
		const metrics = this.performanceMonitor.getMetrics()
		const memoryUsage = this.memoryMonitor.memoryUsagePercentage()

		return {
			config: this.config,
			metrics,
			memoryUsage,
			isHealthy: memoryUsage < MEMORY_PRESSURE_THRESHOLD && metrics.cacheHitRate > MIN_HEALTHY_CACHE_HIT_RATE,
		}
	}

	/**
	 * Update optimization configuration
	 */
	updateConfig(newConfig: Partial<OptimizationConfig>): void {
		this.config = { ...this.config, ...newConfig }
	}

	/**
	 * Cleanup resources
	 */
	cleanup(): void {
		if (this.debugInterval) {
			this.debugInterval()
		}

		// Clear debug functions
		if ((window as any).fontDebug) {
			delete (window as any).fontDebug
		}

	}
}

/**
 * Hook for using font performance optimization
 */
// Singleton instance
export const fontPerformanceOptimizer = new FontPerformanceOptimizer()

export function useFontPerformanceOptimization(
	config?: Partial<OptimizationConfig>
) {
	if (config) {
		fontPerformanceOptimizer.updateConfig(config)
	}
	const optimizer = fontPerformanceOptimizer

	onCleanup(() => {
		optimizer.cleanup()
	})

	return {
		optimizedFontDownload: (
			fontName: string,
			downloadFn: () => Promise<void>
		) => optimizer.optimizedFontDownload(fontName, downloadFn),
		optimizedFontInstallation: (
			fontName: string,
			installFn: () => Promise<number>
		) => optimizer.optimizedFontInstallation(fontName, installFn),
		preloadPopularFonts: (fontNames: string[]) =>
			optimizer.preloadPopularFonts(fontNames),
		getOptimizationStatus: () => optimizer.getOptimizationStatus(),
		updateConfig: (newConfig: Partial<OptimizationConfig>) =>
			optimizer.updateConfig(newConfig),
	}
}

/**
 * Performance-optimized font registry wrapper
 */
export function createOptimizedFontRegistry(
	originalRegistry: FontRegistryActions,
	config?: Partial<OptimizationConfig>
) {
	const optimization = useFontPerformanceOptimization(config)

	return {
		...originalRegistry,

		// Wrap download function with optimization
		downloadFont: async (fontName: string) => {
			await optimization.optimizedFontDownload(fontName, async () => {
				await originalRegistry.downloadFont(fontName)
			})
		},

		// Add optimization status
		getOptimizationStatus: optimization.getOptimizationStatus,

		// Add preloading capability
		preloadPopularFonts: optimization.preloadPopularFonts,
	}
}

/**
 * Resource cleanup utilities
 */
export const ResourceCleanup = {
	/**
	 * Clean up font-related resources
	 */
	async cleanupFontResources(): Promise<void> {
		try {
			// Clear font caches
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()

			for (const key of keys) {
				await cache.delete(key)
			}

			// Clear IndexedDB font metadata
			const dbRequest = indexedDB.deleteDatabase('nerdfonts-metadata')
			await new Promise((resolve, reject) => {
				dbRequest.onsuccess = () => resolve(undefined)
				dbRequest.onerror = () => reject(dbRequest.error)
			})

			// Remove fonts from document
			if (document.fonts) {
				document.fonts.clear()
			}

		} catch (error) {
			console.warn('[ResourceCleanup] Font resource cleanup failed', error)
		}
	},

	/**
	 * Verify resource cleanup
	 */
	async verifyCleanup(): Promise<boolean> {
		try {
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()

			return keys.length === 0
		} catch (error) {
			return false
		}
	},
}
