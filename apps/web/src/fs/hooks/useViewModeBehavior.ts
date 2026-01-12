import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/ViewMode'
import { useViewModeManager } from './useViewModeManager'
import { useViewModeState } from './useViewModeState'

/**
 * Comprehensive view mode behavior management
 * Requirements: 7.4, 7.5 - Consistent behavior patterns across all view modes
 */
export const useViewModeBehavior = (
	path: Accessor<string | undefined>,
	currentViewMode: Accessor<ViewMode>,
	stats: Accessor<ParseResult | undefined> = () => undefined
) => {
	const viewModeManager = useViewModeManager(path, stats)
	const viewModeState = useViewModeState(path, currentViewMode, stats)

	/**
	 * Determine if view mode toggle should be shown
	 * Requirements: 2.1, 2.4, 6.2 - Conditional UI rendering
	 */
	const shouldShowViewModeToggle = createMemo(() => {
		return viewModeManager.supportsMultipleViewModes()
	})

	/**
	 * Get the appropriate component type for rendering
	 * Requirements: 3.1, 3.2, 4.1, 4.2 - Correct component rendering per view mode
	 */
	const getComponentType = createMemo(() => {
		const mode = currentViewMode()
		const currentPath = path()
		
		if (!currentPath) return 'editor'
		
		// Validate the view mode is available for this file
		const validatedMode = viewModeManager.getValidatedViewMode(mode)
		
		switch (validatedMode) {
			case 'ui':
				return 'settings-ui'
			case 'binary':
				return 'binary-viewer'
			case 'editor':
			default:
				return 'editor'
		}
	})

	/**
	 * Handle view mode switching with validation
	 * Requirements: 2.2 - View mode toggle interaction
	 */
	const switchViewMode = (newViewMode: ViewMode): ViewMode => {
		// Validate the requested view mode
		const validatedMode = viewModeManager.getValidatedViewMode(newViewMode)
		
		// Return the validated mode (caller should update their state)
		return validatedMode
	}

	/**
	 * Get tab display information
	 * Requirements: 8.1, 8.2, 8.3, 8.4 - Tab visual distinction and tooltips
	 */
	const getTabDisplayInfo = createMemo(() => {
		const currentPath = path()
		const mode = currentViewMode()
		
		if (!currentPath) return null
		
		const fileName = currentPath.split('/').pop() || currentPath
		const modeLabel = viewModeState.viewModeMetadata()?.label || mode
		
		return {
			fileName,
			viewMode: mode,
			viewModeLabel: modeLabel,
			tooltip: `${currentPath} (${modeLabel})`,
			displayName: shouldShowViewModeToggle() ? `${fileName} (${modeLabel})` : fileName,
		}
	})

	/**
	 * Check if this is a regular file (single view mode only)
	 */
	const isRegularFile = createMemo(() => {
		const availableModes = viewModeManager.availableViewModes()
		return availableModes.length === 1 && availableModes[0] === 'editor'
	})

	/**
	 * Get error handling information
	 */
	const getErrorHandling = createMemo(() => {
		const mode = currentViewMode()
		const currentPath = path()
		
		if (!currentPath) return null
		
		return {
			fallbackMode: 'editor' as ViewMode,
			canFallback: mode !== 'editor',
			errorMessage: `Failed to render ${mode} mode for ${currentPath}`,
		}
	})

	return {
		// Manager functionality
		...viewModeManager,
		
		// State functionality  
		...viewModeState,
		
		// Behavior functionality
		shouldShowViewModeToggle,
		getComponentType,
		switchViewMode,
		getTabDisplayInfo,
		isRegularFile,
		getErrorHandling,
	}
}