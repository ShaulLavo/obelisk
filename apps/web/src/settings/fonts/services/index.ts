/**
 * Font Services — Singleton Architecture
 *
 * Ownership boundaries:
 * - These services own the *caching, downloading, and installation* of fonts.
 * - They do NOT own which font is "active" or CSS variable state — that belongs
 *   to the app-level font registry at `src/fonts/createFontRegistry.ts`.
 * - The font registry dynamically imports from here; these services must never
 *   import from `src/fonts/`.
 *
 * Core services (consumed by the font registry via dynamic import):
 *   FontMetadataService  — IndexedDB metadata persistence
 *   FontCacheService     — Cache API storage for font binaries
 *   FontDownloadService  — Download orchestration with retry
 *   FontInstallationService — FontFace API registration
 *
 * Infrastructure services (internal use only, not consumed outside this directory):
 *   ServiceWorkerManager      — SW registration and messaging
 *   CacheManifestService      — Offline manifest generation
 *   CacheMonitoringService    — Health checks and stats
 *   CacheManagementUtilities  — Automated maintenance
 *   CacheErrorRecovery        — Fallback strategies
 *   RetryService              — Exponential backoff utility
 */

// Core services
export { fontCacheService } from './FontCacheService'
export { fontMetadataService } from './FontMetadataService'
export { fontDownloadService } from './FontDownloadService'
export { fontInstallationService } from './FontInstallationService'

// Service Worker infrastructure
export { serviceWorkerManager } from './ServiceWorkerManager'
export { cacheManifestService } from './CacheManifestService'
export { cacheMonitoringService } from './CacheMonitoringService'
export { cacheManagementUtilities } from './CacheManagementUtilities'

// Error handling and recovery
export { cacheErrorRecovery } from './CacheErrorRecovery'
export { RetryService } from './RetryService'

// Type exports
export type { FontMetadata, CacheStats } from './FontMetadataService'
export type {
	ServiceWorkerCacheStats,
	ServiceWorkerCleanupResult,
	ServiceWorkerClearResult,
} from './ServiceWorkerManager'
export type { CacheManifestEntry, CacheManifest } from './CacheManifestService'
export type {
	CacheMonitoringStats,
	CacheCleanupOptions,
	CacheCleanupResult,
	CacheHealthCheck,
} from './CacheMonitoringService'
export type {
	CacheOptimizationResult,
	CacheMaintenanceSchedule,
	CacheBackupResult,
	CacheRestoreResult,
} from './CacheManagementUtilities'
