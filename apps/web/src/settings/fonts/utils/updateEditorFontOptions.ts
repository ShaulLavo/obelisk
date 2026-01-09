import type { SettingDefinition } from '../../types'

export type FontOption = {
	value: string
	label: string
}

/**
 * Updates the editor font family setting definition with installed fonts
 */
export const updateEditorFontOptions = (
	settings: SettingDefinition[],
	installedFonts: Set<string>
): SettingDefinition[] => {
	return settings.map(setting => {
		if (setting.key !== 'editor.fontFamily') {
			return setting
		}

		// Default font options
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

		// Convert installed fonts to options
		const installedOptions: FontOption[] = Array.from(installedFonts).map(fontName => ({
			value: `"${fontName}", monospace`,
			label: fontName.replace(/([A-Z])/g, ' $1').trim()
		}))

		// Filter out installed fonts that are already in defaults
		const uniqueInstalledOptions = installedOptions.filter(
			installed => !defaultOptions.some(def => def.value === installed.value)
		)

		// Combine options: defaults first, then installed fonts
		const allOptions = [...defaultOptions, ...uniqueInstalledOptions]

		return {
			...setting,
			options: allOptions
		}
	})
}

/**
 * Gets the display name for a font family value
 */
export const getFontDisplayName = (fontValue: string, installedFonts: Set<string>): string => {
	// Check default fonts first
	const defaultFonts: Record<string, string> = {
		"'JetBrains Mono', monospace": "JetBrains Mono",
		"'Fira Code', monospace": "Fira Code",
		"monospace": "System Monospace"
	}

	if (defaultFonts[fontValue]) {
		return defaultFonts[fontValue]
	}

	// Check installed fonts
	for (const fontName of installedFonts) {
		const fontValue_candidate = `"${fontName}", monospace`
		if (fontValue === fontValue_candidate) {
			return fontName.replace(/([A-Z])/g, ' $1').trim()
		}
	}

	// Fallback: try to extract font name from value
	const match = fontValue.match(/['"]([^'"]+)['"]/)
	if (match && match[1]) {
		return match[1].replace(/([A-Z])/g, ' $1').trim()
	}

	return 'Unknown Font'
}

/**
 * Validates if a font family value is available
 */
export const isFontAvailable = (fontValue: string, installedFonts: Set<string>): boolean => {
	// Default fonts are always available
	const defaultFonts = [
		"'JetBrains Mono', monospace",
		"'Fira Code', monospace", 
		"monospace"
	]

	if (defaultFonts.includes(fontValue)) {
		return true
	}

	// Check installed fonts
	for (const fontName of installedFonts) {
		const installedFontValue = `"${fontName}", monospace`
		if (fontValue === installedFontValue) {
			return true
		}
	}

	return false
}