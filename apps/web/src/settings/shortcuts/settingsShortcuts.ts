import type { KeymapController } from '../../keymap/KeymapContext'

type SettingsShortcutDef = {
	bindingId: string
	shortcut: string
	commandId: string
}

const SETTINGS_SHORTCUTS: SettingsShortcutDef[] = [
	{ bindingId: 'settings.open-meta-comma', shortcut: 'meta+comma', commandId: 'settings.open' },
	{ bindingId: 'settings.open-ctrl-comma', shortcut: 'ctrl+comma', commandId: 'settings.open' },
]

/**
 * Registers settings keyboard shortcuts with the KeymapController
 *
 * Shortcuts:
 * - Cmd/Ctrl+,: Open settings
 */
export function registerSettingsShortcuts(
	controller: KeymapController,
	openSettings: () => Promise<void>
) {
	const disposers: (() => void)[] = []

	// Register keybindings
	const bindings = SETTINGS_SHORTCUTS.map((def) => {
		const binding = controller.registerKeybinding({
			shortcut: def.shortcut,
			id: def.bindingId,
			options: { preventDefault: true },
		})
		return binding
	})

	// Register command for opening settings
	disposers.push(
		controller.registerCommand({
			id: 'settings.open',
			run: openSettings,
		})
	)

	// Bind commands to keybindings in global scope
	for (const def of SETTINGS_SHORTCUTS) {
		disposers.push(
			controller.bindCommand({
				scope: 'global',
				bindingId: def.bindingId,
				commandId: def.commandId,
			})
		)
	}

	// Return cleanup function to unregister all shortcuts
	return () => {
		for (const dispose of disposers) dispose()
		for (const binding of bindings) binding.dispose()
	}
}
