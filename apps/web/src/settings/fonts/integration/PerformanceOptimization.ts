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

/**
 * Main performance optimization controller
 */
export class FontPerformanceOptimizer {
	private static instance: FontPerformanceOptimizer
	private config: OptimizationConfig
	private performanceMonitor = usePerformanceMonitor()
	private memoryMonitor = createMemoryMonitor()
	private debugInterval?: () => void

	constructor(config: Partial<OptimizationConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.initialize()
	}

	static getInstance(
		config?: Partial<OptimizationConfig>
	): FontPerformanceOptimizer {
		if (!FontPerformanceOptimizer.instance) {
			FontPerformanceOptimizer.instance = new FontPerformanceOptimizer(config)
		}
		return FontPerformanceOptimizer.instance
	}

	/**
	 * Reset the singleton instance (for testing purposes only)
	 */
	static resetInstance(): void {
		if (FontPerformanceOptimizer.instance) {
			FontPerformanceOptimizer.instance.cleanup()
		}
		FontPerformanceOptimizer.instance = undefined as any
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
			this.debugInterval = PerformanceDebugger.startContinuousMonitoring(30000)
		}
	}

	private setupMemoryMonitoring(): void {
		// Monitor memory usage and warn if it gets too high
		createEffect(() => {
			const memoryUsage = this.memoryMonitor.memoryUsagePercentage()

			if (memoryUsage > 80) {
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

	/**
	 * Optimize font download with performance tracking
	 */
	async optimizedFontDownload(
		fontName: string,
		downloadFn: () => Promise<void>
	): Promise<void> {
		if (this.config.enablePerformanceMonitoring) {
			this.performanceMonitor.startFontDownload(fontName)
		}

		try {
			await FontLoadingOptimizer.queueFontDownload(fontName, downloadFn)

			if (this.config.enablePerformanceMonitoring) {
				this.performanceMonitor.completeFontDownload(fontName, false)
			}
		} catch (error) {
			throw error
		}
	}

	/**
	 * Optimize font installation with performance tracking
	 */
	async optimizedFontInstallation(
		fontName: string,
		installFn: () => Promise<number>
	): Promise<void> {
		if (this.config.enablePerformanceMonitoring) {
			this.performanceMonitor.startFontInstallation(fontName)
		}

		try {
			const size = await installFn()

			if (this.config.enablePerformanceMonitoring) {
				this.performanceMonitor.completeFontInstallation(fontName, size)
			}
		} catch (error) {
			throw error
		}
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
			// Clear unused font caches
			const cache = await caches.open('nerdfonts-v1')
			const keys = await cache.keys()

			// Remove fonts that haven't been accessed recently
			const now = Date.now()
			const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

			for (const request of keys) {
				const response = await cache.match(request)
				if (response) {
					const lastModified = response.headers.get('last-modified')
					if (lastModified) {
						const age = now - new Date(lastModified).getTime()
						if (age > maxAge) {
							await cache.delete(request)
	
						}
					}
				}
			}

			// Force garbage collection if available
			if ('gc' in window && typeof (window as any).gc === 'function') {
				;(window as any).gc()
			}

		} catch (error) {
			// Memory cleanup failed
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
			isHealthy: memoryUsage < 80 && metrics.cacheHitRate > 0.5,
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
export function useFontPerformanceOptimization(
	config?: Partial<OptimizationConfig>
) {
	const optimizer = FontPerformanceOptimizer.getInstance(config)

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
			// Font resource cleanup failed
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
