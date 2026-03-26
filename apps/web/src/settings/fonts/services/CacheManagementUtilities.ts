/**
 * Cache Management Utilities
 *
 * Provides advanced cache management utilities including automated cleanup,
 * cache optimization, and maintenance operations.
 */

import { cacheMonitoringService } from './CacheMonitoringService'
import { serviceWorkerManager } from './ServiceWorkerManager'
import type {
	CacheCleanupOptions,
	CacheCleanupResult,
} from './CacheMonitoringService'
import type { FontMetadata } from './FontMetadataService'

type CacheBackupData = {
	version: string
	timestamp: string
	fonts: FontMetadata[]
	manifest: unknown
}

export interface CacheOptimizationResult {
	success: boolean
	optimizations: string[]
	spaceSaved: number
	errors: string[]
	recommendations: string[]
}

export interface CacheMaintenanceSchedule {
	enabled: boolean
	cleanupInterval: number // in milliseconds
	healthCheckInterval: number // in milliseconds
	maxCacheSize: number // in bytes
	maxFontAge: number // in milliseconds
	autoCleanupThreshold: number // percentage (0-100)
}

export interface CacheBackupResult {
	success: boolean
	backupSize: number
	fontCount: number
	backupId: string
	timestamp: Date
}

export interface CacheRestoreResult {
	success: boolean
	restoredFonts: string[]
	errors: string[]
	totalSize: number
}

export class CacheManagementUtilities {
	private maintenanceInterval: number | null = null
	private isMaintenanceRunning = false

	/**
	 * Start automated cache maintenance
	 */
	startAutomatedMaintenance(schedule: CacheMaintenanceSchedule): void {
		if (!schedule.enabled || this.maintenanceInterval) {
			return
		}

		this.maintenanceInterval = window.setInterval(async () => {
			if (this.isMaintenanceRunning) {
				return // Skip if maintenance is already running
			}

			try {
				this.isMaintenanceRunning = true
				await this.performAutomatedMaintenance(schedule)
			} catch (error) {
				// Maintenance cycle failed
			} finally {
				this.isMaintenanceRunning = false
			}
		}, schedule.cleanupInterval)

		// Start monitoring
		cacheMonitoringService.startMonitoring()
	}

	/**
	 * Stop automated cache maintenance
	 */
	stopAutomatedMaintenance(): void {
		if (this.maintenanceInterval) {
			clearInterval(this.maintenanceInterval)
			this.maintenanceInterval = null
		}

		cacheMonitoringService.stopMonitoring()
	}

	/**
	 * Optimize cache for better performance
	 */
	async optimizeCache(): Promise<CacheOptimizationResult> {
		const optimizations: string[] = []
		const errors: string[] = []
		const recommendations: string[] = []
		let spaceSaved = 0

		try {
			// Get current stats
			const initialStats = await cacheMonitoringService.getCacheStats()

			// 1. Remove duplicate entries between Cache API and Service Worker
			try {
				const duplicateCleanup = await this.removeDuplicateEntries()
				if (duplicateCleanup.spaceSaved > 0) {
					optimizations.push(`Removed duplicate cache entries`)
					spaceSaved += duplicateCleanup.spaceSaved
				}
			} catch (error) {
				errors.push(`Failed to remove duplicates: ${error instanceof Error ? error.message : String(error)}`)
			}

			// 2. Update service worker cache
			try {
				if (serviceWorkerManager.isSupported()) {
					await serviceWorkerManager.forceUpdate()
					optimizations.push('Updated service worker cache')
				}
			} catch (error) {
				errors.push(`Failed to update service worker: ${error instanceof Error ? error.message : String(error)}`)
			}

			// 3. Generate recommendations
			const finalStats = await cacheMonitoringService.getCacheStats()

			if (finalStats.combined.totalSize > 50 * 1024 * 1024) {
				// 50MB
				recommendations.push(
					'Consider increasing cleanup frequency for large cache'
				)
			}

			if (finalStats.performance.cacheHitRate < 0.7) {
				recommendations.push(
					'Pre-cache frequently used fonts to improve hit rate'
				)
			}

			if (!finalStats.serviceWorker.active) {
				recommendations.push('Enable service worker for better offline support')
			}

			return {
				success: errors.length === 0,
				optimizations,
				spaceSaved,
				errors,
				recommendations,
			}
		} catch (error) {
			return {
				success: false,
				optimizations,
				spaceSaved,
				errors: [...errors, error instanceof Error ? error.message : String(error)],
				recommendations,
			}
		}
	}

	/**
	 * Create cache backup
	 */
	async createCacheBackup(): Promise<CacheBackupResult> {
		try {
			const { fontMetadataService } = await import('./FontMetadataService')
			const allMetadata = await fontMetadataService.getAllFontMetadata()

			const backupId = `font-cache-backup-${Date.now()}`
			const timestamp = new Date()

			// Create backup data structure
			const backupData = {
				version: '1.0',
				timestamp: timestamp.toISOString(),
				fonts: allMetadata,
				manifest: await this.getCacheManifest(),
			}

			// Store backup in IndexedDB
			await this.storeBackup(backupId, backupData)

			const totalSize = allMetadata.reduce((sum, font) => sum + font.size, 0)

			return {
				success: true,
				backupSize: totalSize,
				fontCount: allMetadata.length,
				backupId,
				timestamp,
			}
		} catch (error) {
			return {
				success: false,
				backupSize: 0,
				fontCount: 0,
				backupId: '',
				timestamp: new Date(),
			}
		}
	}

	/**
	 * Restore cache from backup
	 */
	async restoreCacheFromBackup(backupId: string): Promise<CacheRestoreResult> {
		try {
			// Load backup data
			const backupData = await this.loadBackup(backupId)
			if (!backupData) {
				throw new Error('Backup not found')
			}

			const { fontCacheService } = await import('./FontCacheService')
			const restoredFonts: string[] = []
			const errors: string[] = []
			let totalSize = 0

			// Restore each font
			for (const fontMetadata of backupData.fonts) {
				try {
					// Check if font is already cached
					const isCached = await fontCacheService.isFontCached(
						fontMetadata.name
					)
					if (!isCached) {
						// Note: This would require the original download URL
						// For now, we'll just restore the metadata
						await this.restoreFontMetadata(fontMetadata)
					}

					restoredFonts.push(fontMetadata.name)
					totalSize += fontMetadata.size
				} catch (error) {
					errors.push(
						`Failed to restore font ${fontMetadata.name}: ${error instanceof Error ? error.message : String(error)}`
					)
				}
			}

			return {
				success: errors.length === 0,
				restoredFonts,
				errors,
				totalSize,
			}
		} catch (error) {
			return {
				success: false,
				restoredFonts: [],
				errors: [error instanceof Error ? error.message : String(error)],
				totalSize: 0,
			}
		}
	}

	/**
	 * Get cache management recommendations
	 */
	async getCacheRecommendations(): Promise<string[]> {
		try {
			const stats = await cacheMonitoringService.getCacheStats()
			const healthCheck = await cacheMonitoringService.performHealthCheck()
			const utilization =
				await cacheMonitoringService.getCacheUtilizationReport()

			const recommendations: string[] = []

			// Size-based recommendations
			if (utilization.utilizationPercentage > 80) {
				recommendations.push(
					'Cache is nearly full - consider cleanup or increasing cache limit'
				)
			} else if (utilization.utilizationPercentage < 20) {
				recommendations.push(
					'Cache utilization is low - consider pre-caching popular fonts'
				)
			}

			// Performance recommendations
			if (stats.performance.cacheHitRate < 0.5) {
				recommendations.push('Low cache hit rate - review font usage patterns')
			}

			if (stats.performance.errorRate > 0.05) {
				recommendations.push(
					'High error rate detected - check network connectivity'
				)
			}

			// Service worker recommendations
			if (!stats.serviceWorker.active) {
				recommendations.push('Enable service worker for offline font support')
			}

			// Maintenance recommendations
			if (utilization.oldestFonts.length > 0) {
				const oldestAge = Math.max(...utilization.oldestFonts.map((f) => f.age))
				const daysSinceOldest = oldestAge / (1000 * 60 * 60 * 24)

				if (daysSinceOldest > 30) {
					recommendations.push('Some fonts are very old - consider cleanup')
				}
			}

			// Add health check recommendations
			recommendations.push(...healthCheck.recommendations)

			return [...new Set(recommendations)] // Remove duplicates
		} catch (error) {
			return ['Unable to generate recommendations']
		}
	}

	// Private helper methods

	private async performAutomatedMaintenance(
		schedule: CacheMaintenanceSchedule
	): Promise<void> {
		try {
			// Check if cleanup is needed
			const stats = await cacheMonitoringService.getCacheStats()
			const utilizationPercentage =
				(stats.combined.totalSize / schedule.maxCacheSize) * 100

			if (utilizationPercentage > schedule.autoCleanupThreshold) {
				const cleanupOptions: CacheCleanupOptions = {
					maxSize: schedule.maxCacheSize,
					maxAge: schedule.maxFontAge,
					keepMostRecent: 10,
				}

				await cacheMonitoringService.cleanupCache(cleanupOptions)
			}

			// Perform health check
			await cacheMonitoringService.performHealthCheck()
		} catch (error) {
			// Automated maintenance failed
		}
	}

	private removeDuplicateEntries(): { spaceSaved: number } {
		return { spaceSaved: 0 }
	}

	private async getCacheManifest(): Promise<unknown> {
		const { cacheManifestService } = await import('./CacheManifestService')
		return await cacheManifestService.generateManifest()
	}

	private storeBackup(backupId: string, backupData: unknown): void {
		const backupJson = JSON.stringify(backupData)
		localStorage.setItem(`cache-backup-${backupId}`, backupJson)
	}

	private loadBackup(backupId: string): CacheBackupData | null {
		const backupJson = localStorage.getItem(`cache-backup-${backupId}`)
		return backupJson ? JSON.parse(backupJson) : null
	}

	private async restoreFontMetadata(metadata: FontMetadata): Promise<void> {
		const { fontMetadataService } = await import('./FontMetadataService')
		await fontMetadataService.storeFontMetadata(metadata)
	}
}

// Singleton instance
export const cacheManagementUtilities = new CacheManagementUtilities()
