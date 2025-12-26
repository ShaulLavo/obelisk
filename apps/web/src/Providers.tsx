import {
	ColorModeProvider,
	ColorModeScript,
	createLocalStorageManager,
} from '@kobalte/core'
import { type ParentComponent } from 'solid-js'
import { ThemedToaster } from './ThemedToaster'
import { FocusProvider } from './focus/focusManager'
import { FsProvider } from './fs/context/FsProvider'
import { KeymapProvider } from './keymap/KeymapContext'
import { Modal } from '@repo/ui/modal'
import { ThemeProvider } from '@repo/theme'

export const storageManager = createLocalStorageManager('ui-theme')

export const Providers: ParentComponent = (props) => {
	return (
		<>
			<ColorModeScript storageType={storageManager.type} />
			<ColorModeProvider storageManager={storageManager}>
				<ThemeProvider>
					<KeymapProvider>
						<FocusProvider>
							<ThemedToaster />
							<Modal />
							<FsProvider>{props.children}</FsProvider>
						</FocusProvider>
					</KeymapProvider>
				</ThemeProvider>
			</ColorModeProvider>
		</>
	)
}
