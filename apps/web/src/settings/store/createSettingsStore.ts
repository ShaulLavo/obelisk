import { createStore, produce, unwrap } from 'solid-js/store'
import { createSignal, onCleanup } from 'solid-js'
import {
	validateSchemas,
	extractDefaultsFromSchemas,
	type Category,
} from '@repo/settings'
import { ensureFs } from '../../fs/runtime/fsRuntime'
import type { FsSource } from '../../fs/types'

// Import schemas from package
import editorSchema from '@repo/settings/schemas/editor.json'
import terminalSchema from '@repo/settings/schemas/terminal.json'
import uiSchema from '@repo/settings/schemas/ui.json'
import appearanceSchema from '@repo/settings/schemas/appearance.json'

export type SettingsState = {
	schemas: Category[]
	values: Record<string, unknown>
	defaults: Record<string, unknown>
	userOverrides: Record<string, unknown>
	isLoaded: boolean
}

export type SettingsActions = {
	getSetting: <T>(key: string) => T
	setSetting: (key: string, value: unknown) => void
	resetSetting: (key: string) => void
	resetAllSettings: () => void
}

export type SettingsStore = [SettingsState, SettingsActions]

const USER_SETTINGS_FILE_PATH = '/.system/userSettings.json'
const DEFAULT_SETTINGS_FILE_PATH = '/.system/defaultSettings.json'

export const createSettingsStore = (
	source: FsSource = 'opfs'
): SettingsStore => {
	const [state, setState] = createStore<SettingsState>({
		schemas: [],
		values: {},
		defaults: {},
		userOverrides: {},
		isLoaded: false,
	})

	const [isSaving, setIsSaving] = createSignal(false)

	const loadSchemas = (): Category[] => {
		const rawSchemas = [
			editorSchema,
			terminalSchema,
			uiSchema,
			appearanceSchema,
		]
		// Validate schema structure with Zod
		return validateSchemas(rawSchemas)
	}

	const ensureSettingsFilesExist = async (
		defaults: Record<string, unknown>
	) => {
		try {
			const ctx = await ensureFs(source)
			await ctx.ensureDir('/.system')

			const defaultsExist = await ctx.exists(DEFAULT_SETTINGS_FILE_PATH)
			const defaultsJson = JSON.stringify(defaults, null, 2)

			if (!defaultsExist) {
				await ctx.write(DEFAULT_SETTINGS_FILE_PATH, defaultsJson)
			} else {
				try {
					const file = ctx.file(DEFAULT_SETTINGS_FILE_PATH, 'r')
					const existingContent = await file.text()
					if (existingContent !== defaultsJson) {
						await ctx.write(DEFAULT_SETTINGS_FILE_PATH, defaultsJson)
					}
				} catch {
					await ctx.write(DEFAULT_SETTINGS_FILE_PATH, defaultsJson)
				}
			}

			const userExists = await ctx.exists(USER_SETTINGS_FILE_PATH)
			if (!userExists) {
				await ctx.write(USER_SETTINGS_FILE_PATH, '{}')
			}
		} catch (error) {
			console.error('[Settings] Failed to ensure settings files exist:', error)
		}
	}

	const loadUserOverrides = async (
		defaults: Record<string, unknown>
	): Promise<Record<string, unknown>> => {
		try {
			await ensureSettingsFilesExist(defaults)

			const ctx = await ensureFs(source)
			const file = ctx.file(USER_SETTINGS_FILE_PATH, 'r')
			const content = await file.text()

			if (!content.trim() || content.trim() === '{}') {
				return {}
			}

			return JSON.parse(content)
		} catch (error) {
			console.warn('[Settings] Failed to load user settings:', error)
			return {}
		}
	}

	const saveToFile = async () => {
		if (isSaving()) return
		setIsSaving(true)

		try {
			const ctx = await ensureFs(source)
			await ctx.ensureDir('/.system')
			const content = JSON.stringify(unwrap(state.userOverrides), null, 2)
			await ctx.write(USER_SETTINGS_FILE_PATH, content)

			window.dispatchEvent(
				new CustomEvent('settings-file-changed', {
					detail: { path: USER_SETTINGS_FILE_PATH, content },
				})
			)
		} catch (error) {
			console.error('[Settings] Failed to save settings:', error)
		} finally {
			setIsSaving(false)
		}
	}

	const initialize = async () => {
		try {
			const schemas = loadSchemas()
			const defaults = extractDefaultsFromSchemas(schemas)
			const userOverrides = await loadUserOverrides(defaults)

			const mergedValues = { ...defaults, ...userOverrides }

			setState(
				produce((s) => {
					s.schemas = schemas
					s.defaults = defaults
					s.userOverrides = userOverrides
					s.values = mergedValues
					s.isLoaded = true
				})
			)
		} catch (error) {
			console.error('[Settings] Failed to initialize settings store:', error)
		}
	}

	void initialize()

	const handleSettingsFileSaved = (event: CustomEvent) => {
		const newOverrides = event.detail as Record<string, unknown>

		setState(
			produce((s) => {
				s.userOverrides = newOverrides
				s.values = { ...s.defaults, ...newOverrides }
			})
		)
	}

	if (typeof window !== 'undefined') {
		window.addEventListener(
			'settings-file-saved',
			handleSettingsFileSaved as EventListener
		)

		onCleanup(() => {
			window.removeEventListener(
				'settings-file-saved',
				handleSettingsFileSaved as EventListener
			)
		})
	}

	const getSetting = <T>(key: string): T => {
		return state.values[key] as T
	}

	const setSetting = (key: string, value: unknown) => {
		const defaultValue = state.defaults[key]
		const isDefault = value === defaultValue

		setState(
			produce((s) => {
				if (isDefault) {
					delete s.userOverrides[key]
				} else {
					s.userOverrides[key] = value
				}
				s.values[key] = value
			})
		)

		void saveToFile()
	}

	const resetSetting = (key: string) => {
		setState(
			produce((s) => {
				delete s.userOverrides[key]
				s.values[key] = s.defaults[key]
			})
		)

		void saveToFile()
	}

	const resetAllSettings = () => {
		setState(
			produce((s) => {
				s.userOverrides = {}
				s.values = { ...s.defaults }
			})
		)

		void saveToFile()
	}

	const actions: SettingsActions = {
		getSetting,
		setSetting,
		resetSetting,
		resetAllSettings,
	}

	return [state, actions]
}
