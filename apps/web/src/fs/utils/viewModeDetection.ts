import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/TabIdentity'
import { viewModeRegistry } from '../registry/ViewModeRegistry'

/**
 * Detects all available view modes for a given file
 */
export const detectAvailableViewModes = (path: string, stats?: ParseResult): ViewMode[] => {
	const availableModes = viewModeRegistry.getAvailableModes(path, stats)
	return availableModes.map(mode => mode.id)
}

/**
 * Gets the default view mode for a file
 */
export const getDefaultViewMode = (path: string, stats?: ParseResult): ViewMode => {
	return viewModeRegistry.getDefaultMode(path, stats)
}

/**
 * Checks if a file supports multiple view modes
 */
export const supportsMultipleViewModes = (path: string, stats?: ParseResult): boolean => {
	const availableModes = detectAvailableViewModes(path, stats)
	return availableModes.length > 1
}

/**
 * Validates if a view mode is available for a specific file
 */
export const isViewModeValid = (viewMode: ViewMode, path: string, stats?: ParseResult): boolean => {
	return viewModeRegistry.isViewModeAvailable(viewMode, path, stats)
}

/**
 * Gets the display label for a view mode
 */
export const getViewModeLabel = (viewMode: ViewMode): string => {
	const mode = viewModeRegistry.getViewMode(viewMode)
	return mode?.label ?? viewMode
}