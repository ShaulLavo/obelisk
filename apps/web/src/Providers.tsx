import {
	ColorModeProvider,
	ColorModeScript,
	createLocalStorageManager,
} from '@kobalte/core'
import { Show, type ParentComponent } from 'solid-js'
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
import { TanStackDevtools } from '@tanstack/solid-devtools'
import { PerfPanel } from './devtools/performance/PerfPanel'

export const storageManager = createLocalStorageManager('ui-theme')

export const Providers: ParentComponent = (props) => {
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
									<FsProvider>
									<LayoutManagerProvider>
										<FontRegistryProvider>
											<CommandPaletteProvider>
												<ThemedToaster />
												<Modal />
												<CommandPalette />
												{props.children}

												{/* TanStack Devtools - only in dev mode */}
												<Show when={import.meta.env.DEV}>
													<TanStackDevtools
														config={{
															position: 'bottom-right',
															hideUntilHover: false,
															openHotkey: ['Control', 'Shift', 'D'],
															defaultOpen: true,
														}}
														eventBusConfig={{
															debug: false,
															connectToServerBus: true,
														}}
														plugins={[
															{
																name: 'Performance',
																render: () => <PerfPanel />,
																defaultOpen: true,
															},
														]}
													/>
												</Show>
											</CommandPaletteProvider>
										</FontRegistryProvider>
									</LayoutManagerProvider>
									</FsProvider>
								</FontZoomProvider>
							</FocusProvider>
						</KeymapProvider>
					</SettingsProvider>
				</ThemeProvider>
			</ColorModeProvider>
		</>
	)
}
