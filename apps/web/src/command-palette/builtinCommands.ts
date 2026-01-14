import type { CommandDescriptor, CommandPaletteRegistry } from './types'
import type { SelectPathOptions } from '../fs/context/FsContext'
import type { FocusArea } from '../focus/focusManager'
import { TbSunMoon } from '@repo/icons/tb/TbSunMoon'
import { VsFolderOpened } from '@repo/icons/vs/VsFolderOpened'
import { TbFolderMinus } from '@repo/icons/tb/TbFolderMinus'
import { TbCode } from '@repo/icons/tb/TbCode'
import { TbTerminal } from '@repo/icons/tb/TbTerminal'
import { TbLayoutSidebar } from '@repo/icons/tb/TbLayoutSidebar'
import { TbDeviceFloppy } from '@repo/icons/tb/TbDeviceFloppy'
import { TbSettings } from '@repo/icons/tb/TbSettings'
import { TbFileCode } from '@repo/icons/tb/TbFileCode'
import { TbLayout } from '@repo/icons/tb/TbLayout'

type ThemeMode = 'light' | 'dark' | 'system'

export type BuiltinCommandDeps = {
	fs: {
		selectPath: (path: string, options?: SelectPathOptions) => Promise<void>
		pickNewRoot: () => Promise<void>
		collapseAll: () => void
		saveFile: () => Promise<void>
	}
	theme: {
		mode: () => ThemeMode | undefined
		setMode: (mode: ThemeMode) => void
	}
	focus: {
		setActiveArea: (area: FocusArea) => void
	}
}

/**
 * Registers all built-in commands with the command palette registry.
 * All context dependencies must be passed in at registration time.
 */
export function registerBuiltinCommands(
	registry: CommandPaletteRegistry,
	deps: BuiltinCommandDeps
): () => void {
	const unregisterFunctions: Array<() => void> = []

	unregisterFunctions.push(registerThemeCommands(registry, deps.theme))
	unregisterFunctions.push(registerFileTreeCommands(registry, deps.fs))
	unregisterFunctions.push(registerFocusCommands(registry, deps.focus))
	unregisterFunctions.push(registerSaveCommand(registry, deps.fs))
	unregisterFunctions.push(registerSettingsCommands(registry, deps.fs))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}

function registerThemeCommands(
	registry: CommandPaletteRegistry,
	theme: BuiltinCommandDeps['theme']
): () => void {
	const toggleThemeCommand: CommandDescriptor = {
		id: 'theme.toggle',
		label: 'Toggle Theme',
		category: 'View',
		shortcut: '⌘⇧T',
		icon: TbSunMoon,
		handler: () => {
			const currentMode = theme.mode() || 'light'
			const modes: ThemeMode[] = ['light', 'dark', 'system']
			const currentIndex = modes.indexOf(currentMode)
			const safeIndex = currentIndex === -1 ? 0 : currentIndex
			const nextMode = modes[(safeIndex + 1) % modes.length]!
			theme.setMode(nextMode)
		},
	}

	return registry.register(toggleThemeCommand)
}

function registerFileTreeCommands(
	registry: CommandPaletteRegistry,
	fs: BuiltinCommandDeps['fs']
): () => void {
	const unregisterFunctions: Array<() => void> = []

	const pickFolderCommand: CommandDescriptor = {
		id: 'fileTree.pickFolder',
		label: 'Pick Folder',
		category: 'File',
		icon: VsFolderOpened,
		handler: () => {
			void fs.pickNewRoot()
		},
	}

	const collapseAllCommand: CommandDescriptor = {
		id: 'fileTree.collapseAll',
		label: 'Collapse All Folders',
		category: 'File',
		icon: TbFolderMinus,
		handler: () => {
			fs.collapseAll()
		},
	}

	unregisterFunctions.push(registry.register(pickFolderCommand))
	unregisterFunctions.push(registry.register(collapseAllCommand))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}

function registerFocusCommands(
	registry: CommandPaletteRegistry,
	focus: BuiltinCommandDeps['focus']
): () => void {
	const unregisterFunctions: Array<() => void> = []

	const focusEditorCommand: CommandDescriptor = {
		id: 'focus.editor',
		label: 'Focus Editor',
		category: 'Navigation',
		icon: TbCode,
		handler: () => {
			focus.setActiveArea('editor')
		},
	}

	const focusTerminalCommand: CommandDescriptor = {
		id: 'focus.terminal',
		label: 'Focus Terminal',
		category: 'Navigation',
		icon: TbTerminal,
		handler: () => {
			focus.setActiveArea('terminal')
		},
	}

	const focusFileTreeCommand: CommandDescriptor = {
		id: 'focus.fileTree',
		label: 'Focus File Tree',
		category: 'Navigation',
		icon: TbLayoutSidebar,
		handler: () => {
			focus.setActiveArea('fileTree')
		},
	}

	unregisterFunctions.push(registry.register(focusEditorCommand))
	unregisterFunctions.push(registry.register(focusTerminalCommand))
	unregisterFunctions.push(registry.register(focusFileTreeCommand))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}

function registerSaveCommand(
	registry: CommandPaletteRegistry,
	fs: BuiltinCommandDeps['fs']
): () => void {
	const saveFileCommand: CommandDescriptor = {
		id: 'file.save',
		label: 'Save File',
		category: 'File',
		shortcut: '⌘S',
		icon: TbDeviceFloppy,
		handler: () => {
			void fs.saveFile()
		},
	}

	return registry.register(saveFileCommand)
}

function registerSettingsCommands(
	registry: CommandPaletteRegistry,
	fs: BuiltinCommandDeps['fs']
): () => void {
	const unregisterFunctions: Array<() => void> = []
	const USER_SETTINGS_FILE_PATH = '/.system/userSettings.json'

	const openSettingsCommand: CommandDescriptor = {
		id: 'settings.open',
		label: 'Open Settings',
		category: 'View',
		shortcut: '⌘,',
		icon: TbSettings,
		handler: () => {
			void fs.selectPath(USER_SETTINGS_FILE_PATH)
		},
	}

	const openSettingsUICommand: CommandDescriptor = {
		id: 'settings.openUI',
		label: 'Open Settings (UI)',
		category: 'View',
		icon: TbLayout,
		handler: () => {
			void fs.selectPath(USER_SETTINGS_FILE_PATH)
		},
	}

	const openSettingsJSONCommand: CommandDescriptor = {
		id: 'settings.openJSON',
		label: 'Open Settings (JSON)',
		category: 'View',
		icon: TbFileCode,
		handler: () => {
			void fs.selectPath(USER_SETTINGS_FILE_PATH)
		},
	}

	unregisterFunctions.push(registry.register(openSettingsCommand))
	unregisterFunctions.push(registry.register(openSettingsUICommand))
	unregisterFunctions.push(registry.register(openSettingsJSONCommand))

	return () => {
		unregisterFunctions.forEach((fn) => fn())
	}
}
