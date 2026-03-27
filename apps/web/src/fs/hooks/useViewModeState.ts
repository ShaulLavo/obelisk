import { createMemo, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/ViewMode'
import { getViewModeRegistry } from '../registry/ViewModeRegistry'

/**
 * State management for view mode-specific functionality
 * Requirements: 7.5 - Hooks for view mode-specific state management
 */
export const useViewModeState = (
	path: Accessor<string | undefined>,
	viewMode: Accessor<ViewMode>,
	stats: Accessor<ParseResult | undefined> = () => undefined
) => {
	/**
	 * Get the current view mode definition
	 */
	const viewModeDefinition = createMemo(() => {
		return getViewModeRegistry().getViewMode(viewMode())
	})

	/**
	 * Create view mode-specific state if the definition provides state hooks
	 */
	const viewModeState = createMemo(() => {
		const definition = viewModeDefinition()
		if (!definition?.stateHooks?.createState) return undefined
		
		return definition.stateHooks.createState()
	})

	/**
	 * Cleanup view mode-specific state when component unmounts or view mode changes
	 */
	onCleanup(() => {
		const definition = viewModeDefinition()
		const state = viewModeState()
		
		if (definition?.stateHooks?.cleanup && state) {
			definition.stateHooks.cleanup(state)
		}
	})

	/**
	 * Check if the current view mode is the default for this file
	 */
	const isDefaultViewMode = createMemo(() => {
		const currentPath = path()
		if (!currentPath) return true
		
		const availableModes = getViewModeRegistry().getAvailableModes(currentPath, stats())
		const defaultMode = availableModes.find(mode => mode.isDefault)
		
		return defaultMode?.id === viewMode() || (!defaultMode && viewMode() === 'editor')
	})

	/**
	 * Get view mode metadata
	 */
	const viewModeMetadata = createMemo(() => {
		const definition = viewModeDefinition()
		if (!definition) return null
		
		return {
			id: definition.id,
			label: definition.label,
			icon: definition.icon,
			isDefault: isDefaultViewMode(),
			hasCustomState: Boolean(definition.stateHooks),
		}
	})

	return {
		viewModeDefinition,
		viewModeState,
		isDefaultViewMode,
		viewModeMetadata,
	}
}