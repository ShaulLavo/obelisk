import type { Component } from 'solid-js'
import { Fs } from './components/fs/Fs'
import { Terminal } from './components/Terminal'

const Main: Component = () => {
	return (
		<main class="h-screen max-h-screen overflow-hidden bg-[#0b0c0f] p-6 text-zinc-100">
			<div class="grid h-full min-h-0 grid-rows-[13fr_7fr] gap-6">
				<div class="min-h-0">
					<Fs />
				</div>
				<div class="min-h-0">
					<Terminal />
				</div>
			</div>
		</main>
	)
}

export default Main
