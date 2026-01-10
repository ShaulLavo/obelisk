import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/TabIdentity'

export type ViewModeDefinition = {
	id: ViewMode
	label: string
	icon?: string
	isAvailable: (path: string, stats?: ParseResult) => boolean
	isDefault?: boolean
}

/**
 * Registry for managing available view modes for different file types
 */
export class ViewModeRegistry {
	private modes = new Map<ViewMode, ViewModeDefinition>()

	/**
	 * Register a new view mode
	 */
	register(mode: ViewModeDefinition): void {
		this.modes.set(mode.id, mode)
	}

	/**
	 * Get all available view modes for a given file
	 */
	getAvailableModes(path: string, stats?: ParseResult): ViewModeDefinition[] {
		const availableModes: ViewModeDefinition[] = []
		
		for (const mode of this.modes.values()) {
			if (mode.isAvailable(path, stats)) {
				availableModes.push(mode)
			}
		}
		
		return availableModes
	}

	/**
	 * Get the default view mode for a given file
	 */
	getDefaultMode(path: string, stats?: ParseResult): ViewMode {
		const availableModes = this.getAvailableModes(path, stats)
		
		// Find explicitly marked default mode
		const defaultMode = availableModes.find(mode => mode.isDefault)
		if (defaultMode) {
			return defaultMode.id
		}
		
		// Fallback to 'editor' mode (should always be available)
		return 'editor'
	}

	/**
	 * Check if a specific view mode is available for a file
	 */
	isViewModeAvailable(viewMode: ViewMode, path: string, stats?: ParseResult): boolean {
		const mode = this.modes.get(viewMode)
		return mode ? mode.isAvailable(path, stats) : false
	}

	/**
	 * Get a specific view mode definition
	 */
	getViewMode(viewMode: ViewMode): ViewModeDefinition | undefined {
		return this.modes.get(viewMode)
	}
}

// Create and configure the global registry instance
export const viewModeRegistry = new ViewModeRegistry()

// Register built-in view modes
viewModeRegistry.register({
	id: 'editor',
	label: 'Editor',
	icon: 'edit',
	isAvailable: () => true, // Always available
	isDefault: true, // Default for most files
})

viewModeRegistry.register({
	id: 'ui',
	label: 'UI',
	icon: 'settings-gear',
	isAvailable: (path) => path === '/.system/settings.json',
})

viewModeRegistry.register({
	id: 'binary',
	label: 'Binary',
	icon: 'file-binary',
	isAvailable: (path, stats) => {
		// Use existing binary detection logic
		return Boolean(stats?.contentKind === 'binary')
	},
})