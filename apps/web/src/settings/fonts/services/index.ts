/**
 * Font Services — Singleton Architecture
 *
 * Font services use class-based patterns to manage stateful resources
 * (caches, workers, initialization lifecycle). The rest of the codebase
 * prefers factory functions.
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

// Core services — getter functions (primary API)
export { getFontCacheService } from './FontCacheService'
export { getFontMetadataService } from './FontMetadataService'
export { getFontDownloadService } from './FontDownloadService'
export { getFontInstallationService } from './FontInstallationService'
export { getCacheErrorRecovery } from './CacheErrorRecovery'
export { RetryService, RETRY_PRESETS } from './RetryService'

// Deprecated singleton proxies (backward compatibility — prefer the getX() functions above)
/** @deprecated Use getFontCacheService() instead. */
export { fontCacheService } from './FontCacheService'
/** @deprecated Use getFontMetadataService() instead. */
export { fontMetadataService } from './FontMetadataService'
/** @deprecated Use getFontDownloadService() instead. */
export { fontDownloadService } from './FontDownloadService'
/** @deprecated Use getFontInstallationService() instead. */
export { fontInstallationService } from './FontInstallationService'
/** @deprecated Use getCacheErrorRecovery() instead. */
export { cacheErrorRecovery } from './CacheErrorRecovery'

// Type exports (public)
export type { FontMetadata, CacheStats } from './FontMetadataService'
