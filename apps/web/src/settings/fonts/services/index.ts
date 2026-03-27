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
 * Core services (public API — consumed by the font registry and store):
 *   FontMetadataService      — IndexedDB metadata persistence
 *   FontCacheService         — Cache API storage for font binaries
 *   FontDownloadService      — Download orchestration with retry
 *   FontInstallationService  — FontFace API registration
 *   RetryService             — Exponential backoff utility
 *   CacheErrorRecovery       — Fallback strategies (used by components)
 *
 * Infrastructure services (internal — consumed only within this directory):
 *   ServiceWorkerManager      — SW registration and messaging
 *   CacheManifestService      — Offline manifest generation
 *   CacheMonitoringService    — Health checks and stats
 *   CacheManagementUtilities  — Automated maintenance
 */

// Core services
export { fontCacheService } from './FontCacheService'
export { fontMetadataService } from './FontMetadataService'
export { fontDownloadService } from './FontDownloadService'
export { fontInstallationService } from './FontInstallationService'
export { RetryService } from './RetryService'
export { cacheErrorRecovery } from './CacheErrorRecovery'

// Type exports (public)
export type { FontMetadata, CacheStats } from './FontMetadataService'
