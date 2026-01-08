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
} from '../terminal/terminalController'
import { useTheme } from '@repo/theme'
import { ensureFs } from '~/fs/runtime/fsRuntime'

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

	const normalizeCwd = (path: string) => {
		if (!path || path === '/') return ''
		return path.replace(/^[/\\]+/, '')
	}

	const handleBackendChange = (event: Event) => {
		const target = event.currentTarget as HTMLSelectElement
		const next = target.value === 'xterm' ? 'xterm' : 'ghostty'
		setTerminalBackend(() => next)
	}

	onMount(() => {
		const unregisterFocus = focus.registerArea('terminal', () => containerRef)
		let controller: TerminalController | null = null

		createResizeObserver(
			() => containerRef,
			() => controller?.fit()
		)

		const setup = async (focusOnMount: boolean) => {
			if (controller) {
				controller.dispose()
				controller = null
			}

			controller = await createTerminalController(containerRef, {
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
			})
			controller.fit()
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
				terminalBackend,
				() => {
					void setup(false).catch((error) => {
						console.error('Failed to switch terminal backend', error)
					})
				},
				{ defer: true }
			)
		)

		createEffect(
			on(
				trackedTheme,
				() => {
					if (!controller) return
					controller.setTheme(theme)
				},
				{ defer: true }
			)
		)

		onCleanup(() => {
			controller?.dispose()
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
			</div>
			<div class="h-full min-h-0 px-2" ref={containerRef} />
		</div>
	)
}
