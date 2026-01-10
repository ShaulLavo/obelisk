import { describe, it, expect, afterEach } from 'vitest'
import { createRoot } from 'solid-js'
import { createSignal } from 'solid-js'
import { useSettingsViewState } from './useSettingsViewState'

describe('useSettingsViewState', () => {
	let dispose: (() => void) | null = null

	afterEach(() => {
		if (dispose) {
			dispose()
			dispose = null
		}
	})

	it('should recognize settings file', () => {
		createRoot((disposeRoot) => {
			dispose = disposeRoot

			const [selectedPath] = createSignal<string | undefined>(
				'/.system/userSettings.json'
			)
			const settingsView = useSettingsViewState({ selectedPath })

			expect(settingsView.isSettingsFile()).toBe(true)
		})
	})

	it('should handle non-settings files', () => {
		createRoot((disposeRoot) => {
			dispose = disposeRoot

			const [selectedPath] = createSignal<string | undefined>(
				'/some/other/file.txt'
			)
			const settingsView = useSettingsViewState({ selectedPath })

			expect(settingsView.isSettingsFile()).toBe(false)
		})
	})

	it('should toggle between JSON and UI view', () => {
		createRoot((disposeRoot) => {
			dispose = disposeRoot

			const [selectedPath] = createSignal<string | undefined>(
				'/.system/userSettings.json'
			)
			const settingsView = useSettingsViewState({ selectedPath })

			// Default is JSON view
			expect(settingsView.shouldShowJSONView()).toBe(true)

			// Switch to UI view
			settingsView.openUIView()
			expect(settingsView.shouldShowJSONView()).toBe(false)

			// Switch back to JSON view
			settingsView.openJSONView()
			expect(settingsView.shouldShowJSONView()).toBe(true)
		})
	})
})
