import { createResizeObserver } from '@solid-primitives/resize-observer'
import { makePersisted } from '@solid-primitives/storage'
import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
	type Component,
} from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { useFs } from '~/fs/context/FsContext'
import { dualStorage } from '@repo/utils/DualStorage'
import { createPrompt } from '../terminal/prompt'
import {
	createTerminalController,
	TerminalController,
	type TerminalBackend,
	type XtermRenderer,
} from '../terminal/terminalController'
import { useTheme } from '@repo/theme'
import { ensureFs } from '~/fs/runtime/fsRuntime'
import { TerminalScrollbar } from '~/terminal/TerminalScrollbar'
import { useSettings } from '~/settings/SettingsProvider'

export const Terminal: Component = () => {
	let containerRef: HTMLDivElement = null!
	const focus = useFocusManager()
	const [state, actions] = useFs()
	const { theme, trackedTheme } = useTheme()
	const [settingsState] = useSettings()
	const storage = typeof window === 'undefined' ? undefined : dualStorage
	const [cwd, setCwd] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal(''),
		{
			name: 'terminal-cwd',
			storage,
		}
	)
	const getTerminalBackend = () =>
		(settingsState.values['terminal.backend'] ?? 'xterm') as TerminalBackend
	const getXtermRenderer = () =>
		(settingsState.values['terminal.xterm.renderer'] ??
			'webgl') as XtermRenderer

	const [controller, setController] = createSignal<TerminalController | null>(
		null
	)

	const normalizeCwd = (path: string) => {
		if (!path || path === '/') return ''
		return path.replace(/^[/\\]+/, '')
	}

	onMount(() => {
		const unregisterFocus = focus.registerArea('terminal', () => containerRef)

		createResizeObserver(
			() => containerRef,
			() => controller()?.fit()
		)

		const disposeController = () => {
			const active = controller()
			if (!active) return
			try {
				active.dispose()
			} catch (error) {
				console.warn('Terminal controller disposal error:', error)
				// Continue with cleanup even if disposal fails
			}
			setController(() => null)
		}

		const setup = async (focusOnMount: boolean) => {
			disposeController()
			// Clear any leftover DOM elements from the previous terminal
			containerRef.innerHTML = ''

			const nextController = await createTerminalController(containerRef, {
				getPrompt: () => createPrompt(cwd(), state.activeSource),
				shellContext: {
					state,
					actions,
					getCwd: () => cwd(),
					setCwd: (path) => setCwd(() => normalizeCwd(path)),
					getVfsContext: async () => {
						const source = state.activeSource ?? 'memory'
						return ensureFs(source)
					},
				},
				theme: theme,
				focusOnMount,
				backend: getTerminalBackend(),
				rendererType: getXtermRenderer(),
			})
			setController(() => nextController)
			nextController.fit()
			const dir = await actions.ensureDirPathLoaded(cwd())
			if (!dir) {
				setCwd(() => '')
			}
		}

		void setup(true).catch((error) => {
			console.error('Failed to initialize terminal controller', error)
		})

		createEffect(
			on(
				[getTerminalBackend, getXtermRenderer],
				() => {
					void setup(false).catch((error) => {
						console.error('Failed to switch terminal backend/renderer', error)
						console.error(
							'Error details:',
							error instanceof Error ? error.message : String(error)
						)
						console.error(
							'Stack:',
							error instanceof Error ? error.stack : 'No stack'
						)
					})
				},
				{ defer: true }
			)
		)

		createEffect(
			on(
				trackedTheme,
				() => {
					const active = controller()
					if (!active) return
					active.setTheme(theme)
				},
				{ defer: true }
			)
		)

		// Watch terminal font settings and update terminal when they change
		createEffect(
			on(
				() => [
					settingsState.values['terminal.font.size'],
					settingsState.values['terminal.font.family'],
					settingsState.isLoaded,
				],
				() => {
					const active = controller()
					if (!active || !settingsState.isLoaded) return

					const fontSize = (settingsState.values['terminal.font.size'] ??
						settingsState.defaults['terminal.font.size'] ??
						14) as number
					const fontFamily = (settingsState.values['terminal.font.family'] ??
						settingsState.defaults['terminal.font.family'] ??
						'JetBrains Mono') as string

					active.setFont(fontSize, fontFamily)
				},
				{ defer: true }
			)
		)

		onCleanup(() => {
			disposeController()
			unregisterFocus()
		})
	})

	return (
		<div class="terminal-container relative h-full min-h-0">
			<div class="relative h-full min-h-0 pl-2">
				<div class="absolute inset-0" ref={containerRef} />
				<TerminalScrollbar controller={controller} />
			</div>
		</div>
	)
}
