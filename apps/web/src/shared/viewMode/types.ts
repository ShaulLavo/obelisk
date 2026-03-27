/**
 * Shared view mode types
 *
 * These types are shared between `fs/` and `split-editor/` to avoid
 * a bidirectional dependency. Both modules import from here instead
 * of from each other.
 */

import type { ParseResult } from '@repo/utils'

export type BuiltInViewMode = 'editor' | 'ui' | 'binary'

export type ViewMode = BuiltInViewMode | (string & {})

export const isBuiltInViewMode = (mode: ViewMode): mode is BuiltInViewMode => {
	return mode === 'editor' || mode === 'ui' || mode === 'binary'
}

export type ViewModeDefinition = {
	id: ViewMode
	label: string
	icon?: string
	isAvailable: (path: string, stats?: ParseResult) => boolean
	isDefault?: boolean
	/** Optional state management hooks for this view mode */
	stateHooks?: {
		createState?: () => unknown
		cleanup?: (state: unknown) => void
	}
}

/**
 * Read-only interface for consuming view mode registry data.
 * Both `fs/` and `split-editor/` can depend on this interface
 * without depending on the concrete registry implementation.
 */
export interface ViewModeRegistryReader {
	getAvailableModes(path: string, stats?: ParseResult): ViewModeDefinition[]
	getDefaultMode(path: string, stats?: ParseResult): ViewMode
	isViewModeAvailable(viewMode: ViewMode, path: string, stats?: ParseResult): boolean
	getViewMode(viewMode: ViewMode): ViewModeDefinition | undefined
	getAllModes(): ViewModeDefinition[]
}
