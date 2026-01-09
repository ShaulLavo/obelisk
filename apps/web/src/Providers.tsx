import {
	ColorModeProvider,
	ColorModeScript,
	createLocalStorageManager,
} from '@kobalte/core'
import { type ParentComponent } from 'solid-js'
import { ThemedToaster } from './ThemedToaster'
import { FocusProvider } from './focus/focusManager'
import { FsProvider } from './fs/context/FsProvider'
import { SettingsProvider } from './settings/SettingsProvider'
import { SettingsEffects } from './settings/SettingsEffects'
import { KeymapProvider } from './keymap/KeymapContext'
import { Modal } from '@repo/ui/modal'
import { ThemeProvider } from '@repo/theme'
import { CommandPaletteProvider } from './command-palette/CommandPaletteProvider'
import { CommandPalette } from './command-palette/CommandPalette'

export const storageManager = createLocalStorageManager('ui-theme')

export const Providers: ParentComponent = (props) => {
	return (
		<>
			<ColorModeScript storageType={storageManager.type} />
			<ColorModeProvider storageManager={storageManager}>
				<ThemeProvider>
					<KeymapProvider>
						<FocusProvider>
							<FsProvider>
								<SettingsProvider>
									<SettingsEffects />
									<CommandPaletteProvider>
										<ThemedToaster />
										<Modal />
										<CommandPalette />
										{props.children}
									</CommandPaletteProvider>
								</SettingsProvider>
							</FsProvider>
						</FocusProvider>
					</KeymapProvider>
				</ThemeProvider>
			</ColorModeProvider>
		</>
	)
}
