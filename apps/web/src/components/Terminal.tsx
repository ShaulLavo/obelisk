import '@xterm/xterm/css/xterm.css'
import { onCleanup, onMount, type Component } from 'solid-js'
import { createTerminalController } from '../terminal/terminalController'
import { useFocusManager } from '~/focus/focusManager'

export const Terminal: Component = () => {
	let containerRef: HTMLDivElement = null!
	const focus = useFocusManager()

	onMount(() => {
		const disposeTerminal = createTerminalController(containerRef)
		const unregisterFocus = focus.registerArea('terminal', () => containerRef)
		onCleanup(() => {
			disposeTerminal()
			unregisterFocus()
		})
	})

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden">
			<div
				class="flex-1 min-h-0 rounded border border-zinc-800/70 bg-black/70 p-2 shadow-xl shadow-black/30"
				ref={el => (containerRef = el)}
			/>
		</div>
	)
}
