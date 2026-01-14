import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/ViewMode'
import { createFilePath } from '@repo/fs'

export type ViewModeDefinition = {
	id: ViewMode
	label: string
	icon?: string
	isAvailable: (path: string, stats?: ParseResult) => boolean
	isDefault?: boolean
	/** Optional state management hooks for this view mode */
	stateHooks?: {
		/** Hook to create view mode-specific state */
		createState?: () => any
		/** Hook to cleanup view mode-specific state */
		cleanup?: (state: any) => void
	}
}

/**
 * Registry for managing available view modes for different file types
 * Provides extensibility infrastructure for adding new view modes
 */
export class ViewModeRegistry {
	private modes = new Map<ViewMode, ViewModeDefinition>()
	private initialized = false

	/**
	 * Register a new view mode
	 * Requirements: 7.1, 7.3 - Clear interface for registering new view modes
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
		const defaultMode = availableModes.find((mode) => mode.isDefault)
		if (defaultMode) {
			return defaultMode.id
		}

		// Fallback to 'editor' mode (should always be available)
		return 'editor'
	}

	/**
	 * Check if a specific view mode is available for a file
	 */
	isViewModeAvailable(
		viewMode: ViewMode,
		path: string,
		stats?: ParseResult
	): boolean {
		const mode = this.modes.get(viewMode)
		return mode ? mode.isAvailable(path, stats) : false
	}

	/**
	 * Get a specific view mode definition
	 */
	getViewMode(viewMode: ViewMode): ViewModeDefinition | undefined {
		return this.modes.get(viewMode)
	}

	/**
	 * Get all registered view modes
	 * Requirements: 7.3 - Allow inspection of registered modes
	 */
	getAllModes(): ViewModeDefinition[] {
		return Array.from(this.modes.values())
	}

	/**
	 * Initialize the registry with built-in modes
	 * Requirements: 7.1 - Registry initialization with built-in modes
	 */
	initialize(): void {
		if (this.initialized) return
		
		this.registerBuiltInModes()
		this.initialized = true
	}

	/**
	 * Register all built-in view modes
	 * Requirements: 7.4, 7.5 - Consistent behavior patterns across all view modes
	 */
	private registerBuiltInModes(): void {
		// Editor mode - always available, default for most files
		this.register({
			id: 'editor',
			label: 'Editor',
			icon: 'edit',
			isAvailable: () => true, // Always available
			isDefault: true, // Default for most files
		})

		// UI mode for settings files (userSettings.json and settings.json)
		this.register({
			id: 'ui',
			label: 'UI',
			icon: 'settings-gear',
			isAvailable: (path) => {
				const normalized = createFilePath(path)
				return (
					normalized === '.system/userSettings.json' ||
					normalized === '.system/settings.json'
				)
			},
		})

		// Binary mode for binary files
		this.register({
			id: 'binary',
			label: 'Binary',
			icon: 'file-binary',
			isAvailable: (path, stats) => {
				// Use existing binary detection logic
				return Boolean(stats?.contentKind === 'binary')
			},
			// Binary files default to editor mode (Requirement 4.4)
			isDefault: false,
		})
	}

	/**
	 * Reset the registry (useful for testing)
	 */
	reset(): void {
		this.modes.clear()
		this.initialized = false
	}
}

// Create and configure the global registry instance
export const viewModeRegistry = new ViewModeRegistry()

// Initialize the registry with built-in modes
viewModeRegistry.initialize()
