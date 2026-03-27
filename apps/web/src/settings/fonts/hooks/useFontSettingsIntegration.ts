import { createMemo } from 'solid-js'
import { useFontStore } from '../store/FontStoreProvider'
import { useSettings } from '../../SettingsProvider'

export type FontOption = {
	value: string
	label: string
}

export const useFontSettingsIntegration = () => {
	const fontStore = useFontStore()
	const [settingsState, settingsActions] = useSettings()

	const currentFontFamily = () =>
		settingsActions.getSetting<string>('editor.font.family')

	const installedFontOptions = createMemo(() => {
		const installed = fontStore.installedFonts()
		if (!installed) return []

		return Array.from(installed).map(
			(fontName): FontOption => ({
				value: `"${fontName}", monospace`,
				label: (fontName as string).replace(/([A-Z])/g, ' $1').trim(),
			})
		)
	})

	const allFontOptions = createMemo((): FontOption[] => {
		const defaultOptions: FontOption[] = [
			{
				value: "'JetBrains Mono', monospace",
				label: 'JetBrains Mono',
			},
			{
				value: "'Fira Code', monospace",
				label: 'Fira Code',
			},
			{
				value: 'monospace',
				label: 'System Monospace',
			},
		]

		const installedOptions = installedFontOptions()

		const uniqueInstalledOptions = installedOptions.filter(
			(installed) =>
				!defaultOptions.some((def) => def.value === installed.value)
		)

		return [...defaultOptions, ...uniqueInstalledOptions]
	})

	const isCurrentFontAvailable = createMemo(() => {
		const current = currentFontFamily()
		const options = allFontOptions()

		return options.some((option) => option.value === current)
	})

	const currentFontDisplayName = createMemo(() => {
		const current = currentFontFamily()
		const options = allFontOptions()

		const option = options.find((opt) => opt.value === current)
		return option?.label || 'Unknown Font'
	})

	const isFontInUse = (fontName: string): boolean => {
		const current = currentFontFamily()
		return (
			current.includes(`"${fontName}"`) || current.includes(`'${fontName}'`)
		)
	}

	const setEditorFontFamily = (fontValue: string) => {
		settingsActions.setSetting('editor.font.family', fontValue)
	}

	return {
		allFontOptions,
		installedFontOptions,
		currentFontFamily,
		currentFontDisplayName,
		isCurrentFontAvailable,
		setEditorFontFamily,
		isFontInUse,
		fontStore,
	}
}
