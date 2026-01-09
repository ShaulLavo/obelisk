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

export const Terminal: Component = () => {
	let containerRef: HTMLDivElement = null!
	const focus = useFocusManager()
	const [state, actions] = useFs()
	const { theme, trackedTheme } = useTheme()
	const storage = typeof window === 'undefined' ? undefined : dualStorage
	const [cwd, setCwd] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal(''),
		{
			name: 'terminal-cwd',
			storage,
		}
	)
	const [terminalBackend, setTerminalBackend] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal<TerminalBackend>('xterm'),
		{
			name: 'terminal-backend',
			storage,
		}
	)
	const [xtermRenderer, setXtermRenderer] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal<XtermRenderer>('webgl'),
		{
			name: 'terminal-xterm-renderer',
			storage,
		}
	)

	const [controller, setController] = createSignal<TerminalController | null>(
		null
	)

	const normalizeCwd = (path: string) => {
		if (!path || path === '/') return ''
		return path.replace(/^[/\\]+/, '')
	}

	const handleBackendChange = (event: Event) => {
		const target = event.currentTarget as HTMLSelectElement
		const next = target.value === 'xterm' ? 'xterm' : 'ghostty'
		setTerminalBackend(() => next)
	}

	const handleRendererChange = (event: Event) => {
		const target = event.currentTarget as HTMLSelectElement
		const next = target.value as XtermRenderer
		setXtermRenderer(() => next)
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
			active.dispose()
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
				backend: terminalBackend(),
				rendererType: xtermRenderer(),
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
				[terminalBackend, xtermRenderer],
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

		onCleanup(() => {
			disposeController()
			unregisterFocus()
		})
	})

	return (
		<div class="terminal-container relative h-full min-h-0">
			<div class="absolute right-3 top-3 z-10 flex items-center gap-2 rounded border border-border bg-background/70 px-2 py-1 text-xs backdrop-blur">
				<span class="text-muted-foreground">Terminal</span>
				<select
					class="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
					value={terminalBackend()}
					onChange={handleBackendChange}
				>
					<option value="ghostty">Ghostty</option>
					<option value="xterm">xterm.js</option>
				</select>
				{terminalBackend() === 'xterm' && (
					<select
						class="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
						value={xtermRenderer()}
						onChange={handleRendererChange}
					>
						<option value="webgl">WebGL</option>
						<option value="canvas">Canvas</option>
						<option value="dom">DOM</option>
					</select>
				)}
			</div>
			<div class="relative h-full min-h-0 pl-2">
				<div class="absolute inset-0" ref={containerRef} />
				<TerminalScrollbar controller={controller} />
			</div>
		</div>
	)
}
