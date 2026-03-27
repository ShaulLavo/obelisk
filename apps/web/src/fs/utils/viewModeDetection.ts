import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/ViewMode'
import { getViewModeRegistry } from '../registry/ViewModeRegistry'

export const detectAvailableViewModes = (
	path: string,
	stats?: ParseResult
): ViewMode[] => {
	const availableModes = getViewModeRegistry().getAvailableModes(path, stats)
	return availableModes.map((mode) => mode.id)
}

export const getDefaultViewMode = (
	path: string,
	stats?: ParseResult
): ViewMode => {
	return getViewModeRegistry().getDefaultMode(path, stats)
}

export const supportsMultipleViewModes = (
	path: string,
	stats?: ParseResult
): boolean => {
	const availableModes = detectAvailableViewModes(path, stats)
	return availableModes.length > 1
}

export const isViewModeValid = (
	viewMode: ViewMode,
	path: string,
	stats?: ParseResult
): boolean => {
	return getViewModeRegistry().isViewModeAvailable(viewMode, path, stats)
}

export const getViewModeLabel = (viewMode: ViewMode): string => {
	const mode = getViewModeRegistry().getViewMode(viewMode)
	return mode?.label ?? viewMode
}

export const getValidViewMode = (
	requestedMode: ViewMode,
	path: string,
	stats?: ParseResult
): ViewMode => {
	if (isViewModeValid(requestedMode, path, stats)) {
		return requestedMode
	}
	return getDefaultViewMode(path, stats)
}

export const isRegularFile = (path: string, stats?: ParseResult): boolean => {
	const availableModes = detectAvailableViewModes(path, stats)
	return availableModes.length === 1 && availableModes[0] === 'editor'
}
