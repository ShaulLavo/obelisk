import { createEffect, createMemo } from 'solid-js'
import { useFontStore } from '../store/FontStoreProvider'
import { useSettings } from '../../SettingsProvider'

export type FontOption = {
	value: string
	label: string
}

/**
 * Hook that integrates the font store with the settings store
 * Provides dynamic font family options that include installed fonts
 */
export const useFontSettingsIntegration = () => {
	const fontStore = useFontStore()
	const [settingsState, settingsActions] = useSettings()

	// Get the current editor font family setting
	const currentFontFamily = () => settingsActions.getSetting<string>('editor.fontFamily')

	// Get installed fonts and create font options
	const installedFontOptions = createMemo(() => {
		const installed = fontStore.installedFonts()
		if (!installed) return []

		return Array.from(installed).map((fontName): FontOption => ({
			value: `"${fontName}", monospace`,
			label: (fontName as string).replace(/([A-Z])/g, ' $1').trim()
		}))
	})

	// Combine default font options with installed fonts
	const allFontOptions = createMemo((): FontOption[] => {
		const defaultOptions: FontOption[] = [
			{
				value: "'JetBrains Mono', monospace",
				label: "JetBrains Mono"
			},
			{
				value: "'Fira Code', monospace",
				label: "Fira Code"
			},
			{
				value: "monospace",
				label: "System Monospace"
			}
		]

		const installedOptions = installedFontOptions()
		
		// Filter out installed fonts that are already in defaults
		const uniqueInstalledOptions = installedOptions.filter(
			installed => !defaultOptions.some(def => def.value === installed.value)
		)

		// Return defaults first, then installed fonts
		return [...defaultOptions, ...uniqueInstalledOptions]
	})

	// Check if the currently selected font is available
	const isCurrentFontAvailable = createMemo(() => {
		const current = currentFontFamily()
		const options = allFontOptions()
		
		return options.some(option => option.value === current)
	})

	// Get the display name for the current font
	const currentFontDisplayName = createMemo(() => {
		const current = currentFontFamily()
		const options = allFontOptions()
		
		const option = options.find(opt => opt.value === current)
		return option?.label || 'Unknown Font'
	})

	// Check if a font name is currently in use
	const isFontInUse = (fontName: string): boolean => {
		const current = currentFontFamily()
		return current.includes(`"${fontName}"`) || current.includes(`'${fontName}'`)
	}

	// Set the editor font family
	const setEditorFontFamily = (fontValue: string) => {
		console.log('[FontSettingsIntegration] Setting editor font family:', fontValue)
		settingsActions.setSetting('editor.fontFamily', fontValue)
	}

	// Effect to validate font availability when installed fonts change
	createEffect(() => {
		const installed = fontStore.installedFonts()
		const current = currentFontFamily()
		
		// If installed fonts are loaded and current font is not available,
		// we could optionally reset to default, but for now just log
		if (installed && !isCurrentFontAvailable()) {
			console.warn('[FontSettingsIntegration] Current font not available:', current)
		}
	})

	return {
		// Font options for dropdowns
		allFontOptions,
		installedFontOptions,
		
		// Current font info
		currentFontFamily,
		currentFontDisplayName,
		isCurrentFontAvailable,
		
		// Actions
		setEditorFontFamily,
		isFontInUse,
		
		// Font store access
		fontStore,
	}
}