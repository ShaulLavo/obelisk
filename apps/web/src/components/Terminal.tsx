import '@xterm/xterm/css/xterm.css'
import { onCleanup, onMount, type Component } from 'solid-js'
import { createTerminalController } from '../terminal/terminalController'

export const Terminal: Component = () => {
	let containerRef: HTMLDivElement = null!

	onMount(() => {
		const dispose = createTerminalController(containerRef)
		onCleanup(dispose)
	})

	return (
		<div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
			<div class="flex items-center gap-3 text-sm">
				<span class="font-semibold text-zinc-200">Terminal</span>
				<span class="rounded border border-zinc-700/70 bg-zinc-900 px-2 py-1 text-xs text-zinc-200">ready</span>
			</div>
			<div
				class="flex-1 min-h-0 rounded border border-zinc-800/70 bg-black/70 p-2 shadow-xl shadow-black/30"
				ref={el => (containerRef = el)}
			/>
		</div>
	)
}
