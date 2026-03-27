/**
 * Typed helpers for the settings CustomEvent bus.
 *
 * Two events coordinate settings state between the editor (FsProvider)
 * and the settings store (createSettingsStore):
 *
 * - `settings-file-changed` — dispatched by the settings store after it
 *   writes userSettings.json.  FsProvider listens to reload the file.
 * - `settings-file-saved`  — dispatched by FsProvider after the editor
 *   saves userSettings.json.  The settings store listens to pick up
 *   the new values.
 */

// ---- Payload types ----

export interface SettingsFileChangedDetail {
	path: string
	content: string
}

export type SettingsFileSavedDetail = Record<string, unknown>

// ---- Typed CustomEvent aliases ----

export type SettingsFileChangedEvent = CustomEvent<SettingsFileChangedDetail>
export type SettingsFileSavedEvent = CustomEvent<SettingsFileSavedDetail>

// ---- Event names (single source of truth) ----

export const SETTINGS_FILE_CHANGED = 'settings-file-changed' as const
export const SETTINGS_FILE_SAVED = 'settings-file-saved' as const

// ---- Dispatch helpers ----

export function dispatchSettingsFileChanged(
	detail: SettingsFileChangedDetail
): void {
	window.dispatchEvent(
		new CustomEvent<SettingsFileChangedDetail>(SETTINGS_FILE_CHANGED, {
			detail,
		})
	)
}

export function dispatchSettingsFileSaved(
	detail: SettingsFileSavedDetail
): void {
	window.dispatchEvent(
		new CustomEvent<SettingsFileSavedDetail>(SETTINGS_FILE_SAVED, {
			detail,
		})
	)
}
