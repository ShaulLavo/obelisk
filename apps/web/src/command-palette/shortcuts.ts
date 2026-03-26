import type { KeymapController } from '../keymap/KeymapContext'
import type { PaletteActions } from './useCommandPalette'

type ShortcutDef = {
	shortcut: string
	bindingId: string
	commandId: string
	preventDefault?: boolean
}

const FILE_MODE_SHORTCUTS: ShortcutDef[] = [
	{ shortcut: 'meta+p', bindingId: 'command-palette.open-file-mode-meta-p', commandId: 'command-palette.open-file-mode' },
	{ shortcut: 'ctrl+p', bindingId: 'command-palette.open-file-mode-ctrl-p', commandId: 'command-palette.open-file-mode' },
	{ shortcut: 'meta+k', bindingId: 'command-palette.open-file-mode-meta-k', commandId: 'command-palette.open-file-mode' },
	{ shortcut: 'ctrl+k', bindingId: 'command-palette.open-file-mode-ctrl-k', commandId: 'command-palette.open-file-mode' },
]

const COMMAND_MODE_SHORTCUTS: ShortcutDef[] = [
	{ shortcut: 'meta+shift+p', bindingId: 'command-palette.open-command-mode-meta-shift-p', commandId: 'command-palette.open-command-mode' },
	{ shortcut: 'ctrl+shift+p', bindingId: 'command-palette.open-command-mode-ctrl-shift-p', commandId: 'command-palette.open-command-mode' },
]

const CLOSE_SHORTCUT: ShortcutDef = {
	shortcut: 'escape',
	bindingId: 'command-palette.close',
	commandId: 'command-palette.close',
	preventDefault: false,
}

const ALL_SHORTCUTS = [...FILE_MODE_SHORTCUTS, ...COMMAND_MODE_SHORTCUTS, CLOSE_SHORTCUT]

export function registerCommandPaletteShortcuts(
	controller: KeymapController,
	actions: PaletteActions,
	isOpen: () => boolean
) {
	const disposers: (() => void)[] = []

	// Register keybindings
	const bindings = ALL_SHORTCUTS.map((def) => {
		const binding = controller.registerKeybinding({
			shortcut: def.shortcut,
			id: def.bindingId,
			options: { preventDefault: def.preventDefault ?? true },
		})
		return binding
	})

	// Register commands
	const toggleMode = (mode: 'file' | 'command') => () => {
		if (isOpen()) {
			actions.close()
		} else {
			actions.open(mode)
		}
	}

	disposers.push(
		controller.registerCommand({ id: 'command-palette.open-file-mode', run: toggleMode('file') }),
		controller.registerCommand({ id: 'command-palette.open-command-mode', run: toggleMode('command') }),
		controller.registerCommand({ id: 'command-palette.close', run: () => { if (isOpen()) actions.close() } }),
	)

	// Bind commands to keybindings
	for (const def of ALL_SHORTCUTS) {
		disposers.push(
			controller.bindCommand({
				scope: 'global',
				bindingId: def.bindingId,
				commandId: def.commandId,
			})
		)
	}

	return () => {
		for (const dispose of disposers) dispose()
		for (const binding of bindings) binding.dispose()
	}
}
