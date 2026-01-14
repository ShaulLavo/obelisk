import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import fc from 'fast-check'
import { createSettingsStore } from './createSettingsStore'
import type { FsSource } from '../../fs/types'

describe('createSettingsStore', () => {
	/**
	 * **Feature: settings-page, Property 1: Store Returns Settings and Actions**
	 * **Validates: Requirements 5.1**
	 */
	it('property: returns valid settings state and actions', () =>
		new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const [state, actions] = createSettingsStore('memory')

				expect(state).toBeDefined()
				expect(state.schemas).toBeDefined()
				expect(state.values).toBeDefined()
				expect(state.defaults).toBeDefined()
				expect(state.userOverrides).toBeDefined()
				expect(state.isLoaded).toBeDefined()

				expect(actions).toBeDefined()
				expect(typeof actions.getSetting).toBe('function')
				expect(typeof actions.setSetting).toBe('function')
				expect(typeof actions.resetSetting).toBe('function')
				expect(typeof actions.resetAllSettings).toBe('function')

				dispose()
				resolve()
			})
		}))

	/**
	 * **Feature: settings-page, Property 2: Initial Values Equal Defaults**
	 * **Validates: Requirements 5.3**
	 */
	it('property: initial values equal defaults before user overrides', () =>
		new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const [state] = createSettingsStore('memory')

				// Wait for schema to load
				const checkLoaded = () => {
					if (state.isLoaded) {
						// Before any user changes, values === defaults
						expect(state.values).toEqual(state.defaults)
						expect(Object.keys(state.userOverrides).length).toBe(0)

						dispose()
						resolve()
					} else {
						setTimeout(checkLoaded, 10)
					}
				}
				checkLoaded()
			})
		}))

	/**
	 * **Feature: settings-page, Property 10: Schema Defaults Are Returned**
	 * **Validates: Requirements 3.1, 5.3**
	 */
	it('property: schema defaults are returned for unset settings', () =>
		new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const [state, actions] = createSettingsStore('memory')

				// Wait for schema to load
				const checkLoaded = () => {
					if (state.isLoaded) {
						// Test that schema defaults are returned for unset settings (new key format)
						const knownDefaults = [
							{ key: 'editor.font.size', expected: 14 },
							{
								key: 'editor.font.family',
								expected: "'JetBrains Mono Variable', monospace",
							},
							{ key: 'editor.cursor.style', expected: 'line' },
							{ key: 'editor.behavior.tabSize', expected: 4 },
							{ key: 'editor.behavior.wordWrap', expected: false },
							{ key: 'appearance.theme.mode', expected: 'dark' },
							{ key: 'appearance.layout.sidebarWidth', expected: 240 },
							{ key: 'appearance.layout.showLineNumbers', expected: true },
							{ key: 'appearance.layout.compactMode', expected: false },
						]

						for (const { key, expected } of knownDefaults) {
							const value = actions.getSetting(key)
							expect(value).toBe(expected)
						}
						dispose()
						resolve()
					} else {
						setTimeout(checkLoaded, 10)
					}
				}
				checkLoaded()
			})
		}))

	/**
	 * **Feature: settings-page, Property 11: Saved Settings Override Defaults**
	 * **Validates: Requirements 5.5**
	 */
	it('property: saved settings override defaults', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Use settings with values guaranteed to be different from defaults
				fc.constantFrom(
					// editor.font.size: default 14, use 20
					{ key: 'editor.font.size', value: 20 },
					// editor.font.family: default "'JetBrains Mono Variable', monospace", use different value
					{ key: 'editor.font.family', value: 'Fira Code' },
					// editor.cursor.style: default 'line', use 'block'
					{ key: 'editor.cursor.style', value: 'block' },
					// editor.behavior.tabSize: default 4, use 2
					{ key: 'editor.behavior.tabSize', value: 2 },
					// editor.behavior.wordWrap: default false, use true
					{ key: 'editor.behavior.wordWrap', value: true },
					// appearance.theme.mode: default 'dark', use 'light'
					{ key: 'appearance.theme.mode', value: 'light' },
					// appearance.layout.sidebarWidth: default 240, use 300
					{ key: 'appearance.layout.sidebarWidth', value: 300 },
					// appearance.layout.showLineNumbers: default true, use false
					{ key: 'appearance.layout.showLineNumbers', value: false },
					// appearance.layout.compactMode: default false, use true
					{ key: 'appearance.layout.compactMode', value: true }
				),
				async ({ key: settingKey, value: settingValue }) => {
					return new Promise<void>((resolve) => {
						createRoot((dispose) => {
							const [state, actions] = createSettingsStore('memory')

							const checkLoaded = () => {
								if (state.isLoaded) {
									// Set a value different from default
									actions.setSetting(settingKey, settingValue)

									// Verify the value is now the override
									expect(actions.getSetting(settingKey)).toBe(settingValue)

									// Verify it appears in userOverrides
									expect(state.userOverrides[settingKey]).toBe(settingValue)

									dispose()
									resolve()
								} else {
									setTimeout(checkLoaded, 10)
								}
							}
							checkLoaded()
						})
					})
				}
			),
			{ numRuns: 10 }
		)
	})

	/**
	 * **Feature: settings-page, Property 12: Reset Setting Returns to Default**
	 * **Validates: Requirements 5.6**
	 */
	it('property: reset setting returns value to default', () =>
		new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const [state, actions] = createSettingsStore('memory')

				const checkLoaded = () => {
					if (state.isLoaded) {
						const testKey = 'editor.font.size'

						// Get the default value
						const defaultValue = state.defaults[testKey]

						// Set a different value
						actions.setSetting(testKey, 999)
						expect(actions.getSetting(testKey)).toBe(999)

						// Reset the setting
						actions.resetSetting(testKey)

						// Verify it's back to default
						expect(actions.getSetting(testKey)).toBe(defaultValue)

						// Verify it's removed from userOverrides
						expect(state.userOverrides[testKey]).toBeUndefined()

						dispose()
						resolve()
					} else {
						setTimeout(checkLoaded, 10)
					}
				}
				checkLoaded()
			})
		}))

	/**
	 * **Feature: settings-page, Property 13: Setting Value to Default Removes Override**
	 * **Validates: Requirements 5.7**
	 */
	it('property: setting value to default removes override', () =>
		new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const [state, actions] = createSettingsStore('memory')

				const checkLoaded = () => {
					if (state.isLoaded) {
						const testKey = 'editor.font.size'

						// Get the default value
						const defaultValue = state.defaults[testKey]

						// Set a different value
						actions.setSetting(testKey, 999)
						expect(state.userOverrides[testKey]).toBe(999)

						// Set back to default value
						actions.setSetting(testKey, defaultValue)

						// Verify it's removed from userOverrides
						expect(state.userOverrides[testKey]).toBeUndefined()

						dispose()
						resolve()
					} else {
						setTimeout(checkLoaded, 10)
					}
				}
				checkLoaded()
			})
		}))

	/**
	 * **Feature: settings-page, Property 14: Reset All Settings Clears All Overrides**
	 * **Validates: Requirements 5.8**
	 */
	it('property: reset all settings clears all overrides', () =>
		new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const [state, actions] = createSettingsStore('memory')

				const checkLoaded = () => {
					if (state.isLoaded) {
						// Set multiple values
						actions.setSetting('editor.font.size', 999)
						actions.setSetting('editor.font.family', 'Custom Font')
						actions.setSetting('appearance.theme.mode', 'light')

						expect(Object.keys(state.userOverrides).length).toBeGreaterThan(0)

						// Reset all
						actions.resetAllSettings()

						// Verify all overrides are cleared
						expect(Object.keys(state.userOverrides).length).toBe(0)
						expect(state.values).toEqual(state.defaults)

						dispose()
						resolve()
					} else {
						setTimeout(checkLoaded, 10)
					}
				}
				checkLoaded()
			})
		}))
})
