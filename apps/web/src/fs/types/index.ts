// Re-export tab identity types and utilities
export type { ViewMode, TabIdentity } from './TabIdentity'
export { createTabId, parseTabId, migrateTabState } from './TabIdentity'

// Re-export view mode registry
export type { ViewModeDefinition } from '../registry/ViewModeRegistry'
export { ViewModeRegistry, viewModeRegistry } from '../registry/ViewModeRegistry'

// Re-export view mode detection utilities
export {
	detectAvailableViewModes,
	getDefaultViewMode,
	supportsMultipleViewModes,
	isViewModeValid,
	getViewModeLabel,
} from '../utils/viewModeDetection'