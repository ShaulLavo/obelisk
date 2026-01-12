import { createMemo } from 'solid-js'
import { useSettings } from '../SettingsProvider'
import type { EditorSyncConfig, ConflictResolutionStrategy } from '@repo/code-editor/sync'
import { DEFAULT_EDITOR_SYNC_CONFIG } from '@repo/code-editor/sync'

/**
 * Hook that provides EditorSyncConfig from the settings store.
 *
 * This hook reads editor.fileSync.* settings and returns a reactive
 * EditorSyncConfig object that updates when settings change.
 *
 * @returns A reactive EditorSyncConfig object
 */
export function useEditorSyncConfig(): () => EditorSyncConfig {
	const [settingsState] = useSettings()

	return createMemo((): EditorSyncConfig => {
		if (!settingsState.isLoaded) {
			return DEFAULT_EDITOR_SYNC_CONFIG
		}

		const getValue = <T>(key: string, defaultValue: T): T => {
			const value = settingsState.values[`editor.fileSync.${key}`]
			return value !== undefined ? (value as T) : defaultValue
		}

		return {
			autoWatch: getValue('autoWatch', DEFAULT_EDITOR_SYNC_CONFIG.autoWatch),
			autoReload: getValue('autoReload', DEFAULT_EDITOR_SYNC_CONFIG.autoReload),
			debounceMs: getValue('debounceMs', DEFAULT_EDITOR_SYNC_CONFIG.debounceMs),
			defaultConflictResolution: getValue<ConflictResolutionStrategy>(
				'defaultConflictResolution',
				DEFAULT_EDITOR_SYNC_CONFIG.defaultConflictResolution
			),
			maxWatchedFiles: getValue('maxWatchedFiles', DEFAULT_EDITOR_SYNC_CONFIG.maxWatchedFiles),
			showReloadNotifications: getValue(
				'showReloadNotifications',
				DEFAULT_EDITOR_SYNC_CONFIG.showReloadNotifications
			),
			preserveEditorState: getValue(
				'preserveEditorState',
				DEFAULT_EDITOR_SYNC_CONFIG.preserveEditorState
			),
		}
	})
}

/**
 * Get a specific editor sync setting value
 *
 * @param key - The setting key (without 'editor.fileSync.' prefix)
 * @returns The setting value or undefined
 */
export function useEditorSyncSetting<K extends keyof EditorSyncConfig>(
	key: K
): () => EditorSyncConfig[K] {
	const [settingsState] = useSettings()

	return createMemo(() => {
		if (!settingsState.isLoaded) {
			return DEFAULT_EDITOR_SYNC_CONFIG[key]
		}

		const value = settingsState.values[`editor.fileSync.${key}`]
		return value !== undefined
			? (value as EditorSyncConfig[K])
			: DEFAULT_EDITOR_SYNC_CONFIG[key]
	})
}
