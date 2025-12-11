// import '@xterm/xterm/css/xterm.css'
import { createResizeObserver } from '@solid-primitives/resize-observer'
import { onCleanup, onMount, type Component } from 'solid-js'
import { createTerminalController } from '../terminal/terminalController'
import { useFocusManager } from '~/focus/focusManager'

export const Terminal: Component = () => {
	let containerRef: HTMLDivElement = null!
	const focus = useFocusManager()

	onMount(async () => {
		const terminal = await createTerminalController(containerRef)
		const unregisterFocus = focus.registerArea('terminal', () => containerRef)

		createResizeObserver(
			() => containerRef,
			() => terminal.fit()
		)

		onCleanup(() => {
			terminal.dispose()
			unregisterFocus()
		})
	})

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden">
			<div
				class="terminal-container relative flex-1 min-h-0 overflow-hidden rounded border border-zinc-800/70 bg-[#0a0a0b] p-2 shadow-xl shadow-black/30"
				ref={el => (containerRef = el)}
			/>
		</div>
	)
}
