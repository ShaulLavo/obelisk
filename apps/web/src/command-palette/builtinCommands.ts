import type { CommandDescriptor, CommandPaletteRegistry } from './types'
import {
	setSettingsJsonView,
	setSettingsUIView,
} from '../fs/hooks/useSettingsViewState'
import type { FsActions } from '../fs/context/FsContext'

/**
 * Registers all built-in commands with the command palette registry.
 * This includes theme commands, file tree commands, focus commands, save commands, and settings commands.
 *
 * Note: This function should be called within a SolidJS component context
 * where hooks like useTheme, useFs, and useFocusManager are available.
 */
export function registerBuiltinCommands(
	registry: CommandPaletteRegistry,
	fsActions?: FsActions
): () => void {
	const unregisterFunctions: Array<() => void> = []

	// Theme commands
	unregisterFunctions.push(registerThemeCommands(registry))

	// File tree commands
	unregisterFunctions.push(registerFileTreeCommands(registry))

	// Focus commands
	unregisterFunctions.push(registerFocusCommands(registry))

	// Save command
	unregisterFunctions.push(registerSaveCommand(registry))

	// Settings commands (requires fsActions)
	if (fsActions) {
		unregisterFunctions.push(registerSettingsCommands(registry, fsActions))
	}

	// Return function to unregister all commands
	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}

/**
 * Registers theme-related commands
 */
function registerThemeCommands(registry: CommandPaletteRegistry): () => void {
	const toggleThemeCommand: CommandDescriptor = {
		id: 'theme.toggle',
		label: 'Toggle Theme',
		category: 'View',
		shortcut: '⌘⇧T',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useTheme } = await import('@repo/theme')
			const { mode, setMode } = useTheme()

			// Get current mode with fallback
			const currentMode = mode() || 'light'
			const modes = ['light', 'dark', 'system'] as const
			const currentIndex = modes.indexOf(currentMode as (typeof modes)[number])

			// Calculate next mode (with fallback to light if not found)
			const safeIndex = currentIndex === -1 ? 0 : currentIndex
			const nextMode = modes[(safeIndex + 1) % modes.length]!

			setMode(nextMode)
		},
	}

	return registry.register(toggleThemeCommand)
}

/**
 * Registers file tree related commands
 */
function registerFileTreeCommands(
	registry: CommandPaletteRegistry
): () => void {
	const unregisterFunctions: Array<() => void> = []

	const pickFolderCommand: CommandDescriptor = {
		id: 'fileTree.pickFolder',
		label: 'Pick Folder',
		category: 'File',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useFs } = await import('../fs/context/FsContext')
			const [, actions] = useFs()
			await actions.pickNewRoot()
		},
	}

	const collapseAllCommand: CommandDescriptor = {
		id: 'fileTree.collapseAll',
		label: 'Collapse All Folders',
		category: 'File',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useFs } = await import('../fs/context/FsContext')
			const [, actions] = useFs()
			actions.collapseAll()
		},
	}

	unregisterFunctions.push(registry.register(pickFolderCommand))
	unregisterFunctions.push(registry.register(collapseAllCommand))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}

/**
 * Registers focus management commands
 */
function registerFocusCommands(registry: CommandPaletteRegistry): () => void {
	const unregisterFunctions: Array<() => void> = []

	const focusEditorCommand: CommandDescriptor = {
		id: 'focus.editor',
		label: 'Focus Editor',
		category: 'Navigation',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useFocusManager } = await import('../focus/focusManager')
			const focusManager = useFocusManager()
			focusManager.setActiveArea('editor')
		},
	}

	const focusTerminalCommand: CommandDescriptor = {
		id: 'focus.terminal',
		label: 'Focus Terminal',
		category: 'Navigation',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useFocusManager } = await import('../focus/focusManager')
			const focusManager = useFocusManager()
			focusManager.setActiveArea('terminal')
		},
	}

	const focusFileTreeCommand: CommandDescriptor = {
		id: 'focus.fileTree',
		label: 'Focus File Tree',
		category: 'Navigation',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useFocusManager } = await import('../focus/focusManager')
			const focusManager = useFocusManager()
			focusManager.setActiveArea('fileTree')
		},
	}

	unregisterFunctions.push(registry.register(focusEditorCommand))
	unregisterFunctions.push(registry.register(focusTerminalCommand))
	unregisterFunctions.push(registry.register(focusFileTreeCommand))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}

/**
 * Registers save command
 */
function registerSaveCommand(registry: CommandPaletteRegistry): () => void {
	const saveFileCommand: CommandDescriptor = {
		id: 'file.save',
		label: 'Save File',
		category: 'File',
		shortcut: '⌘S',
		handler: async () => {
			// Dynamic import to avoid issues in test environment
			const { useFs } = await import('../fs/context/FsContext')
			const [, actions] = useFs()
			await actions.saveFile()
		},
	}

	return registry.register(saveFileCommand)
}

/**
 * Registers settings-related commands
 */
function registerSettingsCommands(
	registry: CommandPaletteRegistry,
	fsActions: FsActions
): () => void {
	const unregisterFunctions: Array<() => void> = []
	const USER_SETTINGS_FILE_PATH = '/.system/userSettings.json'

	const openSettingsCommand: CommandDescriptor = {
		id: 'settings.open',
		label: 'Open Settings',
		category: 'View',
		shortcut: '⌘,',
		handler: async () => {
			await fsActions.selectPath(USER_SETTINGS_FILE_PATH)
			setSettingsJsonView()
		},
	}

	const openSettingsUICommand: CommandDescriptor = {
		id: 'settings.openUI',
		label: 'Open Settings (UI)',
		category: 'View',
		handler: async () => {
			await fsActions.selectPath(USER_SETTINGS_FILE_PATH)
			setSettingsUIView()
		},
	}

	const openSettingsJSONCommand: CommandDescriptor = {
		id: 'settings.openJSON',
		label: 'Open Settings (JSON)',
		category: 'View',
		handler: async () => {
			await fsActions.selectPath(USER_SETTINGS_FILE_PATH)
			setSettingsJsonView()
		},
	}

	unregisterFunctions.push(registry.register(openSettingsCommand))
	unregisterFunctions.push(registry.register(openSettingsUICommand))
	unregisterFunctions.push(registry.register(openSettingsJSONCommand))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}
