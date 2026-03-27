import {
	ColorModeProvider,
	ColorModeScript,
	createLocalStorageManager,
} from '@kobalte/core'
import { type ParentComponent } from 'solid-js'
import { ThemedToaster } from './ThemedToaster'
import { FocusProvider } from './focus/focusManager'
import { FsProvider } from './fs/context/FsProvider'
import { LayoutManagerProvider } from './fs/context/LayoutManagerContext'
import { FontRegistryProvider } from './fonts'
import { SettingsProvider } from './settings/SettingsProvider'
import { SettingsEffects } from './settings/SettingsEffects'
import { KeymapProvider } from './keymap/KeymapContext'
import { FontZoomProvider } from './hooks/FontZoomProvider'
import { Modal } from '@repo/ui/modal'
import { ThemeProvider } from '@repo/theme'
import { CommandPaletteProvider } from './command-palette/CommandPaletteProvider'
import { CommandPalette } from './command-palette/CommandPalette'

export const storageManager = createLocalStorageManager('ui-theme')

/**
 * Theme and settings providers - lightweight, needed immediately.
 */
const CoreProviders: ParentComponent = (props) => {
	return (
		<>
			<ColorModeScript storageType={storageManager.type} />
			<ColorModeProvider storageManager={storageManager}>
				<ThemeProvider>
					<SettingsProvider>
						<SettingsEffects />
						<KeymapProvider>
							<FocusProvider>
								<FontZoomProvider>
									{props.children}
								</FontZoomProvider>
							</FocusProvider>
						</KeymapProvider>
					</SettingsProvider>
				</ThemeProvider>
			</ColorModeProvider>
		</>
	)
}

/**
 * Filesystem and font providers - heavier, depend on core providers.
 */
const WorkspaceProviders: ParentComponent = (props) => {
	return (
		<FsProvider>
			<LayoutManagerProvider>
				<FontRegistryProvider>
					{props.children}
				</FontRegistryProvider>
			</LayoutManagerProvider>
		</FsProvider>
	)
}

/**
 * Command palette and UI overlay providers - depend on workspace context.
 */
const OverlayProviders: ParentComponent = (props) => {
	return (
		<CommandPaletteProvider>
			<ThemedToaster />
			<Modal />
			<CommandPalette />
			{props.children}
		</CommandPaletteProvider>
	)
}

export const Providers: ParentComponent = (props) => {
	return (
		<CoreProviders>
			<WorkspaceProviders>
				<OverlayProviders>
					{props.children}
				</OverlayProviders>
			</WorkspaceProviders>
		</CoreProviders>
	)
}
