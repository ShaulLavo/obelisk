import {
	createContext,
	useContext,
	onMount,
	onCleanup,
	type ParentComponent,
} from 'solid-js'
import { createCommandPaletteRegistry } from './registry'
import { useCommandPalette } from './useCommandPalette'
import {
	registerBuiltinCommands,
	type BuiltinCommandDeps,
} from './builtinCommands'
import { registerCommandPaletteShortcuts } from './shortcuts'
import { registerSettingsShortcuts } from '../settings/shortcuts/settingsShortcuts'
import { useKeymap } from '../keymap/KeymapContext'
import { useFs } from '../fs/context/FsContext'
import { useFocusManager } from '../focus/focusManager'
import { useTheme } from '@repo/theme'
import type { CommandPaletteRegistry } from './types'
import type {
	PaletteState,
	PaletteActions,
	PaletteResult,
} from './useCommandPalette'

interface CommandPaletteContextValue {
	registry: CommandPaletteRegistry
	state: () => PaletteState
	actions: PaletteActions
	results: () => PaletteResult[]
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>()

export function useCommandPaletteContext(): CommandPaletteContextValue {
	const context = useContext(CommandPaletteContext)
	if (!context) {
		throw new Error(
			'useCommandPaletteContext must be used within a CommandPaletteProvider'
		)
	}
	return context
}

export const CommandPaletteProvider: ParentComponent = (props) => {
	const registry = createCommandPaletteRegistry()
	const [state, actions, results] = useCommandPalette()
	const keymapController = useKeymap()
	const [, fsActions] = useFs()
	const focusManager = useFocusManager()
	const { mode, setMode } = useTheme()

	onMount(() => {
		const deps: BuiltinCommandDeps = {
			fs: {
				selectPath: fsActions.selectPath,
				setViewMode: fsActions.setViewMode,
				pickNewRoot: fsActions.pickNewRoot,
				collapseAll: fsActions.collapseAll,
				saveFile: fsActions.saveFile,
			},
			theme: {
				mode,
				setMode,
			},
			focus: {
				setActiveArea: focusManager.setActiveArea,
			},
		}

		const unregisterBuiltinCommands = registerBuiltinCommands(registry, deps)

		const unregisterShortcuts = registerCommandPaletteShortcuts(
			keymapController,
			actions,
			() => state().isOpen
		)

		const unregisterSettingsShortcuts = registerSettingsShortcuts(
			keymapController,
			() => fsActions.selectPath('/.system/userSettings.json')
		)

		onCleanup(() => {
			unregisterBuiltinCommands()
			unregisterShortcuts()
			unregisterSettingsShortcuts()
		})
	})

	const contextValue: CommandPaletteContextValue = {
		registry,
		state,
		actions,
		results,
	}

	return (
		<CommandPaletteContext.Provider value={contextValue}>
			{props.children}
		</CommandPaletteContext.Provider>
	)
}
