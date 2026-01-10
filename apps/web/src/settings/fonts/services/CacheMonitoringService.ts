/**
 * Cache Monitoring Service
 *
 * Provides comprehensive cache monitoring, statistics, and management utilities
 * for both Cache API and service worker caches.
 */

import { serviceWorkerManager } from './ServiceWorkerManager'
import { cacheManifestService } from './CacheManifestService'
import type { FontMetadata } from './FontMetadataService'

export interface CacheMonitoringStats {
	// Cache API stats
	cacheApi: {
		supported: boolean
		totalSize: number
		fontCount: number
		lastCleanup: Date
		cacheHitRate?: number
	}

	// Service Worker stats
	serviceWorker: {
		active: boolean
		version: string
		totalSize: number
		fontCount: number
		lastUpdated: Date
	}

	// Combined stats
	combined: {
		totalFonts: number
		totalSize: number
		offlineAvailable: number
		duplicateSize: number
	}

	// Performance metrics
	performance: {
		averageDownloadTime: number
		cacheHitRate: number
		errorRate: number
		lastMeasurement: Date
	}
}

export interface CacheCleanupOptions {
	maxSize?: number
	maxAge?: number // in milliseconds
	keepMostRecent?: number
	dryRun?: boolean
}

export interface CacheCleanupResult {
	success: boolean
	removedFonts: string[]
	freedSpace: number
	errors: string[]
	newStats: CacheMonitoringStats
}

export interface CacheHealthCheck {
	status: 'healthy' | 'warning' | 'critical'
	issues: string[]
	recommendations: string[]
	lastCheck: Date
}

export class CacheMonitoringService {
	private static readonly MONITORING_INTERVAL = 60000 // 1 minute
	private static readonly HEALTH_CHECK_INTERVAL = 300000 // 5 minutes

	private monitoringInterval: number | null = null
	private healthCheckInterval: number | null = null
	private performanceMetrics = new Map<string, number[]>()
	private errorCount = 0
	private totalOperations = 0

	/**
	 * Start cache monitoring
	 */
	startMonitoring(): void {
		if (this.monitoringInterval) {
			return // Already monitoring
		}

		console.log('[CacheMonitoringService] Starting cache monitoring')

		this.monitoringInterval = window.setInterval(async () => {
			try {
				await this.collectMetrics()
			} catch (error) {
				console.error(
					'[CacheMonitoringService] Error collecting metrics:',
					error
				)
			}
		}, CacheMonitoringService.MONITORING_INTERVAL)

		this.healthCheckInterval = window.setInterval(async () => {
			try {
				await this.performHealthCheck()
			} catch (error) {
				console.error(
					'[CacheMonitoringService] Error performing health check:',
					error
				)
			}
		}, CacheMonitoringService.HEALTH_CHECK_INTERVAL)
	}

	/**
	 * Stop cache monitoring
	 */
	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval)
			this.monitoringInterval = null
		}

		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = null
		}

		console.log('[CacheMonitoringService] Stopped cache monitoring')
	}

	/**
	 * Get comprehensive cache statistics
	 */
	async getCacheStats(): Promise<CacheMonitoringStats> {
		try {
			const { fontCacheService } = await import('./FontCacheService')
			const cacheApiStats = await fontCacheService.getCacheStats()

			let swStats = null
			try {
				if (serviceWorkerManager.isSupported()) {
					swStats = await serviceWorkerManager.getCacheStats()
				}
			} catch (error) {
				console.warn('[CacheMonitoringService] Failed to get SW stats:', error)
			}

			const manifest = await cacheManifestService.generateManifest()
			const offlineCount = manifest.entries.filter(
				(e) => e.isAvailableOffline
			).length

			const cacheHitRate = this.calculateCacheHitRate()
			const errorRate = this.calculateErrorRate()
			const avgDownloadTime = this.calculateAverageDownloadTime()

			return {
				cacheApi: {
					supported: 'caches' in window,
					totalSize: cacheApiStats.totalSize,
					fontCount: cacheApiStats.fontCount,
					lastCleanup: cacheApiStats.lastCleanup,
					cacheHitRate,
				},
				serviceWorker: {
					active: serviceWorkerManager.isSupported(),
					version: swStats?.cacheVersion || 'unknown',
					totalSize: swStats?.totalSize || 0,
					fontCount: swStats?.fontCount || 0,
					lastUpdated: swStats?.lastUpdated
						? new Date(swStats.lastUpdated)
						: new Date(),
				},
				combined: {
					totalFonts: Math.max(
						cacheApiStats.fontCount,
						swStats?.fontCount || 0
					),
					totalSize: cacheApiStats.totalSize + (swStats?.totalSize || 0),
					offlineAvailable: offlineCount,
					duplicateSize: this.calculateDuplicateSize(
						cacheApiStats.totalSize,
						swStats?.totalSize || 0
					),
				},
				performance: {
					averageDownloadTime: avgDownloadTime,
					cacheHitRate,
					errorRate,
					lastMeasurement: new Date(),
				},
			}
		} catch (error) {
			console.error(
				'[CacheMonitoringService] Failed to get cache stats:',
				error
			)

			return this.getDefaultStats()
		}
	}

	/**
	 * Perform cache cleanup with advanced options
	 */
	async cleanupCache(
		options: CacheCleanupOptions = {}
	): Promise<CacheCleanupResult> {
		const {
			maxSize = 100 * 1024 * 1024, // 100MB
			maxAge = 30 * 24 * 60 * 60 * 1000, // 30 days
			keepMostRecent = 10,
			dryRun = false,
		} = options

		console.log('[CacheMonitoringService] Starting cache cleanup', { options })

		try {
			const { fontMetadataService } = await import('./FontMetadataService')
			const { fontCacheService } = await import('./FontCacheService')

			const initialStats = await this.getCacheStats()
			const allMetadata = await fontMetadataService.getAllFontMetadata()

			const fontsToRemove = this.selectFontsForCleanup(allMetadata, {
				maxSize,
				maxAge,
				keepMostRecent,
				currentSize: initialStats.combined.totalSize,
			})

			const removedFonts: string[] = []
			const errors: string[] = []
			let freedSpace = 0

			if (!dryRun && fontsToRemove.length > 0) {
				for (const fontName of fontsToRemove) {
					try {
						const metadata = await fontMetadataService.getFontMetadata(fontName)
						if (metadata) {
							freedSpace += metadata.size
						}

						await fontCacheService.removeFont(fontName)

						if (serviceWorkerManager.isSupported()) {
							await serviceWorkerManager.clearFontCache(fontName)
						}

						removedFonts.push(fontName)
						console.log(`[CacheMonitoringService] Removed font: ${fontName}`)
					} catch (error) {
						const errorMsg = `Failed to remove font ${fontName}: ${error.message}`
						errors.push(errorMsg)
						console.error('[CacheMonitoringService]', errorMsg)
					}
				}
			}

			const finalStats = await this.getCacheStats()

			return {
				success: errors.length === 0,
				removedFonts: dryRun ? fontsToRemove : removedFonts,
				freedSpace: dryRun
					? this.estimateFreedSpace(fontsToRemove, allMetadata)
					: freedSpace,
				errors,
				newStats: finalStats,
			}
		} catch (error) {
			console.error('[CacheMonitoringService] Cache cleanup failed:', error)

			return {
				success: false,
				removedFonts: [],
				freedSpace: 0,
				errors: [error.message],
				newStats: await this.getCacheStats(),
			}
		}
	}

	/**
	 * Perform cache health check
	 */
	async performHealthCheck(): Promise<CacheHealthCheck> {
		const issues: string[] = []
		const recommendations: string[] = []

		try {
			const stats = await this.getCacheStats()

			const maxRecommendedSize = 100 * 1024 * 1024 // 100MB
			if (stats.combined.totalSize > maxRecommendedSize) {
				issues.push(
					`Cache size (${this.formatBytes(stats.combined.totalSize)}) exceeds recommended limit`
				)
				recommendations.push('Run cache cleanup to free space')
			}

			if (!stats.serviceWorker.active) {
				issues.push(
					'Service worker is not active - offline functionality unavailable'
				)
				recommendations.push('Refresh the page to activate service worker')
			}

			if (stats.performance.errorRate > 0.1) {
				// 10% error rate
				issues.push(
					`High error rate detected: ${(stats.performance.errorRate * 100).toFixed(1)}%`
				)
				recommendations.push('Check network connectivity and server status')
			}

			if (stats.performance.cacheHitRate < 0.5) {
				// 50% hit rate
				issues.push(
					`Low cache hit rate: ${(stats.performance.cacheHitRate * 100).toFixed(1)}%`
				)
				recommendations.push('Consider pre-caching frequently used fonts')
			}

			if (stats.combined.duplicateSize > 10 * 1024 * 1024) {
				// 10MB
				issues.push(
					`Significant duplicate storage detected: ${this.formatBytes(stats.combined.duplicateSize)}`
				)
				recommendations.push('Optimize cache strategy to reduce duplication')
			}

			let status: 'healthy' | 'warning' | 'critical' = 'healthy'
			if (issues.length > 0) {
				status = issues.some(
					(issue) =>
						issue.includes('exceeds') ||
						issue.includes('High error rate') ||
						issue.includes('not active')
				)
					? 'critical'
					: 'warning'
			}

			const healthCheck: CacheHealthCheck = {
				status,
				issues,
				recommendations,
				lastCheck: new Date(),
			}

			if (status !== 'healthy') {
				console.warn(
					'[CacheMonitoringService] Health check issues detected:',
					healthCheck
				)
			}

			return healthCheck
		} catch (error) {
			console.error('[CacheMonitoringService] Health check failed:', error)

			return {
				status: 'critical',
				issues: [`Health check failed: ${error.message}`],
				recommendations: [
					'Check browser console for detailed error information',
				],
				lastCheck: new Date(),
			}
		}
	}

	/**
	 * Record performance metric
	 */
	recordMetric(operation: string, duration: number): void {
		if (!this.performanceMetrics.has(operation)) {
			this.performanceMetrics.set(operation, [])
		}

		const metrics = this.performanceMetrics.get(operation)!
		metrics.push(duration)

		if (metrics.length > 100) {
			metrics.shift()
		}

		this.totalOperations++
	}

	/**
	 * Record error
	 */
	recordError(): void {
		this.errorCount++
	}

	/**
	 * Get cache utilization report
	 */
	async getCacheUtilizationReport(): Promise<{
		totalCapacity: number
		usedSpace: number
		utilizationPercentage: number
		topFontsBySize: Array<{ name: string; size: number }>
		oldestFonts: Array<{ name: string; age: number }>
		leastUsedFonts: Array<{ name: string; lastAccessed: Date }>
	}> {
		try {
			const { fontMetadataService } = await import('./FontMetadataService')
			const stats = await this.getCacheStats()
			const allMetadata = await fontMetadataService.getAllFontMetadata()

			const totalCapacity = 100 * 1024 * 1024 // 100MB
			const usedSpace = stats.combined.totalSize
			const utilizationPercentage = (usedSpace / totalCapacity) * 100

			const topFontsBySize = allMetadata
				.sort((a, b) => b.size - a.size)
				.slice(0, 10)
				.map((font) => ({ name: font.name, size: font.size }))

			const now = new Date()
			const oldestFonts = allMetadata
				.sort((a, b) => a.installedAt.getTime() - b.installedAt.getTime())
				.slice(0, 10)
				.map((font) => ({
					name: font.name,
					age: now.getTime() - font.installedAt.getTime(),
				}))

			const leastUsedFonts = allMetadata
				.sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime())
				.slice(0, 10)
				.map((font) => ({
					name: font.name,
					lastAccessed: font.lastAccessed,
				}))

			return {
				totalCapacity,
				usedSpace,
				utilizationPercentage,
				topFontsBySize,
				oldestFonts,
				leastUsedFonts,
			}
		} catch (error) {
			console.error(
				'[CacheMonitoringService] Failed to generate utilization report:',
				error
			)
			throw error
		}
	}

	// Private helper methods

	private async collectMetrics(): Promise<void> {
		console.log('[CacheMonitoringService] Collecting metrics...')
	}

	private calculateCacheHitRate(): number {
		const cacheHits = this.performanceMetrics.get('cache-hit')?.length || 0
		const cacheMisses = this.performanceMetrics.get('cache-miss')?.length || 0
		const total = cacheHits + cacheMisses

		return total > 0 ? cacheHits / total : 0
	}

	private calculateErrorRate(): number {
		return this.totalOperations > 0 ? this.errorCount / this.totalOperations : 0
	}

	private calculateAverageDownloadTime(): number {
		const downloadTimes = this.performanceMetrics.get('download') || []
		if (downloadTimes.length === 0) return 0

		const sum = downloadTimes.reduce((acc, time) => acc + time, 0)
		return sum / downloadTimes.length
	}

	private calculateDuplicateSize(cacheApiSize: number, swSize: number): number {
		return Math.min(cacheApiSize, swSize)
	}

	private selectFontsForCleanup(
		metadata: FontMetadata[],
		options: {
			maxSize: number
			maxAge: number
			keepMostRecent: number
			currentSize: number
		}
	): string[] {
		if (options.currentSize <= options.maxSize) {
			return [] // No cleanup needed
		}

		const now = new Date()
		const fontsToRemove: string[] = []

		const sortedFonts = [...metadata].sort(
			(a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime()
		)

		for (const font of sortedFonts) {
			const age = now.getTime() - font.lastAccessed.getTime()
			if (age > options.maxAge) {
				fontsToRemove.push(font.name)
			}
		}

		if (
			fontsToRemove.length === 0 &&
			sortedFonts.length > options.keepMostRecent
		) {
			const fontsToKeep = sortedFonts.slice(-options.keepMostRecent)
			const keepSet = new Set(fontsToKeep.map((f) => f.name))

			for (const font of sortedFonts) {
				if (!keepSet.has(font.name)) {
					fontsToRemove.push(font.name)
				}
			}
		}

		return fontsToRemove
	}

	private estimateFreedSpace(
		fontNames: string[],
		metadata: FontMetadata[]
	): number {
		const metadataMap = new Map(metadata.map((m) => [m.name, m]))
		return fontNames.reduce((total, name) => {
			const font = metadataMap.get(name)
			return total + (font?.size || 0)
		}, 0)
	}

	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 Bytes'

		const k = 1024
		const sizes = ['Bytes', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))

		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
	}

	private getDefaultStats(): CacheMonitoringStats {
		return {
			cacheApi: {
				supported: 'caches' in window,
				totalSize: 0,
				fontCount: 0,
				lastCleanup: new Date(),
				cacheHitRate: 0,
			},
			serviceWorker: {
				active: false,
				version: 'unknown',
				totalSize: 0,
				fontCount: 0,
				lastUpdated: new Date(),
			},
			combined: {
				totalFonts: 0,
				totalSize: 0,
				offlineAvailable: 0,
				duplicateSize: 0,
			},
			performance: {
				averageDownloadTime: 0,
				cacheHitRate: 0,
				errorRate: 0,
				lastMeasurement: new Date(),
			},
		}
	}
}

export const cacheMonitoringService = new CacheMonitoringService()
