/**
 * Service Worker Initialization Utility
 *
 * Provides utilities to initialize and configure the service worker
 * for font caching when the application starts.
 */

import { serviceWorkerManager } from '../services/ServiceWorkerManager'
import { cacheMonitoringService } from '../services/CacheMonitoringService'

export interface ServiceWorkerInitOptions {
	enableMonitoring?: boolean
	enableAutomatedMaintenance?: boolean
	maxCacheSize?: number
	cleanupInterval?: number
	healthCheckInterval?: number
}

/**
 * Initialize service worker for font caching
 */
export async function initializeServiceWorker(
	options: ServiceWorkerInitOptions = {}
): Promise<{
	success: boolean
	serviceWorkerActive: boolean
	monitoringActive: boolean
	error?: string
}> {
	const {
		enableMonitoring = true,
		enableAutomatedMaintenance = false,
		maxCacheSize = 100 * 1024 * 1024, // 100MB
		cleanupInterval = 60 * 60 * 1000, // 1 hour
		healthCheckInterval = 5 * 60 * 1000, // 5 minutes
	} = options

	try {
		console.log(
			'[ServiceWorkerInit] Initializing service worker for font caching'
		)

		// Initialize service worker manager
		await serviceWorkerManager.init()
		const serviceWorkerActive = serviceWorkerManager.isSupported()

		if (serviceWorkerActive) {
			console.log('[ServiceWorkerInit] Service worker initialized successfully')
		} else {
			console.warn(
				'[ServiceWorkerInit] Service worker not supported or failed to initialize'
			)
		}

		// Start monitoring if enabled
		let monitoringActive = false
		if (enableMonitoring) {
			try {
				cacheMonitoringService.startMonitoring()
				monitoringActive = true
				console.log('[ServiceWorkerInit] Cache monitoring started')
			} catch (error) {
				console.warn('[ServiceWorkerInit] Failed to start monitoring:', error)
			}
		}

		// Start automated maintenance if enabled
		if (enableAutomatedMaintenance) {
			try {
				const { cacheManagementUtilities } =
					await import('../services/CacheManagementUtilities')

				cacheManagementUtilities.startAutomatedMaintenance({
					enabled: true,
					cleanupInterval,
					healthCheckInterval,
					maxCacheSize,
					maxFontAge: 30 * 24 * 60 * 60 * 1000, // 30 days
					autoCleanupThreshold: 80, // 80% utilization
				})

				console.log('[ServiceWorkerInit] Automated maintenance started')
			} catch (error) {
				console.warn(
					'[ServiceWorkerInit] Failed to start automated maintenance:',
					error
				)
			}
		}

		return {
			success: true,
			serviceWorkerActive,
			monitoringActive,
		}
	} catch (error: any) {
		console.error(
			'[ServiceWorkerInit] Failed to initialize service worker:',
			error
		)

		return {
			success: false,
			serviceWorkerActive: false,
			monitoringActive: false,
			error: error.message,
		}
	}
}

/**
 * Check service worker status
 */
export function getServiceWorkerStatus(): {
	supported: boolean
	registered: boolean
	active: boolean
	version?: string
} {
	const supported = 'serviceWorker' in navigator
	const registered = serviceWorkerManager.isSupported()

	return {
		supported,
		registered,
		active: registered && !!navigator.serviceWorker.controller,
		version: registered ? '1.0' : undefined,
	}
}

/**
 * Cleanup service worker resources
 */
export async function cleanupServiceWorker(): Promise<void> {
	try {
		console.log('[ServiceWorkerInit] Cleaning up service worker resources')

		// Stop monitoring
		cacheMonitoringService.stopMonitoring()

		// Stop automated maintenance
		const { cacheManagementUtilities } =
			await import('../services/CacheManagementUtilities')
		cacheManagementUtilities.stopAutomatedMaintenance()

		// Optionally unregister service worker (uncomment if needed)
		// await serviceWorkerManager.unregister()

		console.log('[ServiceWorkerInit] Service worker cleanup completed')
	} catch (error) {
		console.error(
			'[ServiceWorkerInit] Failed to cleanup service worker:',
			error
		)
	}
}

/**
 * Force service worker update
 */
export async function updateServiceWorker(): Promise<boolean> {
	try {
		if (!serviceWorkerManager.isSupported()) {
			console.warn('[ServiceWorkerInit] Service worker not supported')
			return false
		}

		await serviceWorkerManager.forceUpdate()
		console.log('[ServiceWorkerInit] Service worker update completed')
		return true
	} catch (error) {
		console.error('[ServiceWorkerInit] Failed to update service worker:', error)
		return false
	}
}

/**
 * Get service worker cache statistics
 */
export async function getServiceWorkerCacheStats(): Promise<any> {
	try {
		if (!serviceWorkerManager.isSupported()) {
			return null
		}

		return await serviceWorkerManager.getCacheStats()
	} catch (error) {
		console.error('[ServiceWorkerInit] Failed to get cache stats:', error)
		return null
	}
}
