import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/ViewMode'
import { getViewModeRegistry } from '../registry/ViewModeRegistry'
import { 
	detectAvailableViewModes, 
	getDefaultViewMode, 
	getValidViewMode,
	isViewModeValid,
	getViewModeLabel
} from '../utils/viewModeDetection'

export const useViewModeManager = (
	path: Accessor<string | undefined>,
	stats: Accessor<ParseResult | undefined> = () => undefined
) => {
	const availableViewModes = createMemo(() => {
		const currentPath = path()
		if (!currentPath) return []
		
		return detectAvailableViewModes(currentPath, stats())
	})

	const defaultViewMode = createMemo(() => {
		const currentPath = path()
		if (!currentPath) return 'editor' as ViewMode
		
		return getDefaultViewMode(currentPath, stats())
	})

	const supportsMultipleViewModes = createMemo(() => {
		return availableViewModes().length > 1
	})

	const getValidatedViewMode = (requestedMode: ViewMode): ViewMode => {
		const currentPath = path()
		if (!currentPath) return 'editor'
		
		return getValidViewMode(requestedMode, currentPath, stats())
	}

	const isValidViewMode = (viewMode: ViewMode): boolean => {
		const currentPath = path()
		if (!currentPath) return viewMode === 'editor'
		
		return isViewModeValid(viewMode, currentPath, stats())
	}

	const getViewModeOptions = createMemo(() => {
		return availableViewModes().map(mode => ({
			id: mode,
			label: getViewModeLabel(mode),
			definition: getViewModeRegistry().getViewMode(mode)
		}))
	})

	const getViewModeDefinition = (viewMode: ViewMode) => {
		return getViewModeRegistry().getViewMode(viewMode)
	}

	return {
		availableViewModes,
		defaultViewMode,
		supportsMultipleViewModes,
		getValidatedViewMode,
		isValidViewMode,
		getViewModeOptions,
		getViewModeDefinition,
	}
}