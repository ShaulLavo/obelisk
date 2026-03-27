import type { ParseResult } from '@repo/utils'
import type {
	ViewMode,
	ViewModeDefinition,
	ViewModeRegistryReader,
} from '../../shared/viewMode'
import { createFilePath } from '@repo/fs'
import { createLazySingleton } from '../../settings/fonts/services/createLazySingleton'

// Re-export shared types so existing consumers don't break
export type { ViewModeDefinition } from '../../shared/viewMode'

export class ViewModeRegistry implements ViewModeRegistryReader {
	private modes = new Map<ViewMode, ViewModeDefinition>()
	private initialized = false

	register(mode: ViewModeDefinition): void {
		this.modes.set(mode.id, mode)
	}

	getAvailableModes(path: string, stats?: ParseResult): ViewModeDefinition[] {
		const availableModes: ViewModeDefinition[] = []

		for (const mode of this.modes.values()) {
			if (mode.isAvailable(path, stats)) {
				availableModes.push(mode)
			}
		}

		return availableModes
	}

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

	isViewModeAvailable(
		viewMode: ViewMode,
		path: string,
		stats?: ParseResult
	): boolean {
		const mode = this.modes.get(viewMode)
		return mode ? mode.isAvailable(path, stats) : false
	}

	getViewMode(viewMode: ViewMode): ViewModeDefinition | undefined {
		return this.modes.get(viewMode)
	}

	getAllModes(): ViewModeDefinition[] {
		return Array.from(this.modes.values())
	}

	initialize(): void {
		if (this.initialized) return
		
		this.registerBuiltInModes()
		this.initialized = true
	}

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
			isDefault: false,
		})
	}

	reset(): void {
		this.modes.clear()
		this.initialized = false
	}
}

const { get: getViewModeRegistry, deprecated: viewModeRegistry } =
	createLazySingleton(() => {
		const registry = new ViewModeRegistry()
		registry.initialize()
		return registry
	})

export { getViewModeRegistry, viewModeRegistry }
