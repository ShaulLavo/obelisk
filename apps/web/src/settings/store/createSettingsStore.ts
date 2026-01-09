import { createStore, produce, unwrap } from 'solid-js/store'
import { createEffect, createSignal } from 'solid-js'
import { trackStore } from '@solid-primitives/deep'
import type { SettingsSchema, SettingDefinition } from '../types'
import { ensureFs } from '../../fs/runtime/fsRuntime'
import type { FsSource } from '../../fs/types'

export type SettingsState = {
	schema: SettingsSchema
	values: Record<string, unknown> // Current setting values
	defaults: Record<string, unknown> // Default values from schema
	isLoaded: boolean
}

export type SettingsActions = {
	getSetting: <T>(key: string) => T
	setSetting: (key: string, value: unknown) => void
	resetSetting: (key: string) => void
	resetAllSettings: () => void
	getSettingsForCategory: (categoryId: string) => SettingDefinition[]
}

export type SettingsStore = [SettingsState, SettingsActions]

const SETTINGS_FILE_PATH = '/.system/settings.json'

export const createSettingsStore = (
	source: FsSource = 'opfs'
): SettingsStore => {
	const [state, setState] = createStore<SettingsState>({
		schema: { categories: [], settings: [] },
		values: {},
		defaults: {},
		isLoaded: false,
	})

	const [isInitialized, setIsInitialized] = createSignal(false)

	const loadSchema = async (): Promise<SettingsSchema> => {
		try {
			// Import schema files dynamically
			const [editorSchema, appearanceSchema, terminalSchema, fileTreeSchema] =
				await Promise.all([
					import('../schemas/editor.json'),
					import('../schemas/appearance.json'),
					import('../schemas/terminal.json'),
					import('../schemas/fileTree.json'),
				])

			const categories = [
				editorSchema.category,
				terminalSchema.category,
				fileTreeSchema.category,
				appearanceSchema.category,
			]

			const settings: SettingDefinition[] = [
				...(editorSchema.settings as SettingDefinition[]),
				...(terminalSchema.settings as SettingDefinition[]),
				...(fileTreeSchema.settings as SettingDefinition[]),
				...(appearanceSchema.settings as SettingDefinition[]),
			]

			return { categories, settings }
		} catch (error) {
			console.error('[Settings] Failed to load schema:', error)
			return { categories: [], settings: [] }
		}
	}

	// Extract default values from schema
	const extractDefaults = (schema: SettingsSchema): Record<string, unknown> => {
		const defaults: Record<string, unknown> = {}
		for (const setting of schema.settings) {
			defaults[setting.key] = setting.default
		}
		return defaults
	}

	// Load saved values from OPFS
	const loadSavedSettings = async (): Promise<Record<string, unknown>> => {
		try {
			const ctx = await ensureFs(source)
			const exists = await ctx.exists(SETTINGS_FILE_PATH)

			if (!exists) {
				return {}
			}

			const file = ctx.file(SETTINGS_FILE_PATH, 'r')
			const content = await file.text()

			if (!content.trim()) {
				return {}
			}

			return JSON.parse(content)
		} catch (error) {
			console.warn('[Settings] Failed to load saved settings:', error)
			return {}
		}
	}

	// Save settings to OPFS
	const saveSettings = async (values: Record<string, unknown>) => {
		try {
			const ctx = await ensureFs(source)

			// Ensure the .system directory exists
			await ctx.ensureDir('/.system')

			// Write settings file
			await ctx.write(SETTINGS_FILE_PATH, JSON.stringify(values, null, 2))
		} catch (error) {
			console.error('[Settings] Failed to save settings:', error)
		}
	}

	// Initialize the store
	const initialize = async () => {
		try {
			const schema = await loadSchema()
			const defaults = extractDefaults(schema)
			const savedValues = await loadSavedSettings()

			setState(
				produce((s) => {
					s.schema = schema
					s.defaults = defaults
					s.values = savedValues
					s.isLoaded = true
				})
			)

			setIsInitialized(true)
		} catch (error) {
			console.error('[Settings] Failed to initialize settings store:', error)
		}
	}

	// Persist to OPFS when values change (but only after initialization)
	createEffect(() => {
		// Track all nested changes in the values store
		trackStore(state.values)

		if (isInitialized() && state.isLoaded) {
			// Use unwrap to get a plain object for JSON serialization
			void saveSettings(unwrap(state.values))
		}
	})

	// Initialize on creation
	void initialize()

	const getSetting = <T>(key: string): T => {
		return (state.values[key] ?? state.defaults[key]) as T
	}

	const setSetting = (key: string, value: unknown) => {
		setState(
			produce((s) => {
				s.values[key] = value
			})
		)
	}

	const resetSetting = (key: string) => {
		setState(
			produce((s) => {
				delete s.values[key]
			})
		)
	}

	const resetAllSettings = () => {
		setState(
			produce((s) => {
				s.values = {}
			})
		)
	}

	const getSettingsForCategory = (categoryId: string): SettingDefinition[] => {
		return state.schema.settings.filter(
			(setting) => setting.category === categoryId
		)
	}

	const actions: SettingsActions = {
		getSetting,
		setSetting,
		resetSetting,
		resetAllSettings,
		getSettingsForCategory,
	}

	return [state, actions]
}
