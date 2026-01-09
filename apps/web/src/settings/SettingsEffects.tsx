import { createEffect, on, type Component } from 'solid-js'
import { useSettings } from './SettingsProvider'
import { useTheme } from '@repo/theme'
import type { ThemeMode } from '@repo/theme'

/**
 * Component that syncs settings values with their corresponding providers/effects.
 * This must be rendered inside both SettingsProvider and ThemeProvider.
 */
export const SettingsEffects: Component = () => {
	const [settingsState] = useSettings()
	const { setMode, mode } = useTheme()

	// Sync appearance.theme setting with ThemeProvider
	createEffect(
		on(
			() => settingsState.values['appearance.theme'],
			(themeValue) => {
				if (!settingsState.isLoaded) return

				// Map settings value to theme mode
				const newMode = (themeValue as ThemeMode) ?? 'dark'

				// Only update if different to avoid loops
				if (mode() !== newMode) {
					// Use view transition if available, matching AnimatedModeToggle behavior
					if (document.startViewTransition) {
						// Add class to disable default view transitions
						document.documentElement.classList.add('theme-transitioning')

						// Add style to force no transitions during the switch
						const style = document.createElement('style')
						style.innerHTML = '* { transition: none !important; }'
						document.head.appendChild(style)

						const transition = document.startViewTransition(() => {
							setMode(newMode)
						})

						void transition.ready.then(() => {
							style.remove()

							// Since we don't have the click event coordinates from the store update,
							// we'll start the animation from the center of the screen
							const x = window.innerWidth / 2
							const y = window.innerHeight / 2

							const maxRadius = Math.hypot(
								Math.max(x, window.innerWidth - x),
								Math.max(y, window.innerHeight - y)
							)

							document.documentElement.animate(
								{
									clipPath: [
										`circle(0px at ${x}px ${y}px)`,
										`circle(${maxRadius}px at ${x}px ${y}px)`,
									],
								},
								{
									duration: 400,
									easing: 'ease-in-out',
									pseudoElement: '::view-transition-new(root)',
								}
							)
						})

						void transition.finished.then(() => {
							document.documentElement.classList.remove('theme-transitioning')
						})
					} else {
						setMode(newMode)
					}
				}
			}
		)
	)

	// Note: We could also sync theme -> settings here if needed,
	// but currently theme changes from command palette already work
	// because they directly call setMode() which updates localStorage.

	// Sync per-area font settings to CSS custom properties
	// These can be consumed by components using var(--editor-font-size), etc.
	createEffect(() => {
		if (!settingsState.isLoaded) return

		const root = document.documentElement

		// Editor font settings
		const editorFontSize =
			settingsState.values['editor.fontSize'] ??
			settingsState.defaults['editor.fontSize']
		const editorFontFamily =
			settingsState.values['editor.fontFamily'] ??
			settingsState.defaults['editor.fontFamily']
		if (editorFontSize != null) {
			root.style.setProperty('--editor-font-size', `${editorFontSize}px`)
		}
		if (editorFontFamily != null) {
			root.style.setProperty('--editor-font-family', String(editorFontFamily))
		}

		// Terminal font settings
		const terminalFontSize =
			settingsState.values['terminal.fontSize'] ??
			settingsState.defaults['terminal.fontSize']
		const terminalFontFamily =
			settingsState.values['terminal.fontFamily'] ??
			settingsState.defaults['terminal.fontFamily']
		if (terminalFontSize != null) {
			root.style.setProperty('--terminal-font-size', `${terminalFontSize}px`)
		}
		if (terminalFontFamily != null) {
			root.style.setProperty(
				'--terminal-font-family',
				String(terminalFontFamily)
			)
		}

		// File tree font settings
		const fileTreeFontSize =
			settingsState.values['fileTree.fontSize'] ??
			settingsState.defaults['fileTree.fontSize']
		const fileTreeFontFamily =
			settingsState.values['fileTree.fontFamily'] ??
			settingsState.defaults['fileTree.fontFamily']
		if (fileTreeFontSize != null) {
			root.style.setProperty('--file-tree-font-size', `${fileTreeFontSize}px`)
		}
		if (fileTreeFontFamily != null) {
			root.style.setProperty(
				'--file-tree-font-family',
				String(fileTreeFontFamily)
			)
		}
	})

	return null
}
