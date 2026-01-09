import { createEffect, createMemo } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { createSettingsStore, type SettingsStore } from '../../store/createSettingsStore'
import { updateEditorFontOptions } from '../utils/updateEditorFontOptions'
import type { SettingsSchema } from '../../types'
import type { FsSource } from '../../../fs/types'

export type FontAwareSettingsStore = [SettingsState, SettingsActions & {
	getEnhancedSchema: () => SettingsSchema
	getAvailableFontOptions: () => Array<{ value: string; label: string }>
	isFontAvailable: (fontValue: string) => boolean
}]

/**
 * Creates a settings store that is aware of installed fonts
 * and dynamically updates the editor font family options
 */
export const createFontAwareSettingsStore = (
	installedFonts: () => Set<string> | undefined,
	source: FsSource = 'opfs'
): FontAwareSettingsStore => {
	const [baseState, baseActions] = createSettingsStore(source)

	// Enhanced schema that includes installed fonts in editor font options
	const enhancedSchema = createMemo(() => {
		const installed = installedFonts()
		if (!installed || !baseState.isLoaded) {
			return baseState.schema
		}

		const updatedSettings = updateEditorFontOptions(baseState.schema.settings, installed)
		
		return {
			...baseState.schema,
			settings: updatedSettings
		}
	})

	// Get available font options for the editor
	const getAvailableFontOptions = () => {
		const schema = enhancedSchema()
		const fontSetting = schema.settings.find(s => s.key === 'editor.fontFamily')
		return fontSetting?.options || []
	}

	// Check if a font value is available
	const isFontAvailable = (fontValue: string): boolean => {
		const options = getAvailableFontOptions()
		return options.some(option => option.value === fontValue)
	}

	// Enhanced actions that include font awareness
	const enhancedActions = {
		...baseActions,
		getEnhancedSchema: () => enhancedSchema(),
		getAvailableFontOptions,
		isFontAvailable,
	}

	// Log when font options change
	createEffect(() => {
		const installed = installedFonts()
		if (installed) {
			console.log('[FontAwareSettingsStore] Installed fonts updated:', JSON.stringify(Array.from(installed), null, 2))
			console.log('[FontAwareSettingsStore] Available font options:', JSON.stringify(getAvailableFontOptions(), null, 2))
		}
	})

	return [baseState, enhancedActions] as FontAwareSettingsStore
}