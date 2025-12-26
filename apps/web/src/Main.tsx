/* eslint-disable solid/reactivity */
import { Resizable, ResizableHandle, ResizablePanel } from '@repo/ui/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { createSignal, type Component } from 'solid-js'
import { StatusBar } from './components/StatusBar'
import { Terminal } from './components/Terminal'
import { Fs } from './fs/components/Fs'
import { dualStorage } from '@repo/utils/DualStorage'

const Main: Component = () => {
	const [verticalPanelSize, setVerticalPanelSize] = makePersisted(
		createSignal<number[]>([0.65, 0.35]),
		{
			name: 'main-vertical-panel-size',
			storage: dualStorage,
		}
	)

	return (
		<main class="h-screen max-h-screen overflow-hidden bg-background text-foreground">
			<div class="flex h-full min-h-0 flex-col">
				<Resizable
					orientation="vertical"
					class="flex flex-1 min-h-0 flex-col"
					onSizesChange={(sizes) => {
						if (sizes.length !== 2) return
						setVerticalPanelSize(() => [...sizes])
					}}
				>
					<ResizablePanel
						initialSize={verticalPanelSize()[0] ?? 0.65}
						minSize={0.01}
						collapsible
						class="min-h-0 overflow-auto border-r border-border/30 bg-muted/60"
					>
						<Fs />
					</ResizablePanel>
					<ResizableHandle
						class="z-20"
						aria-label="Resize editor and terminal"
					/>
					<ResizablePanel
						initialSize={verticalPanelSize()[1] ?? 0.35}
						minSize={0.01}
						collapsible
						class="flex-1 min-h-0 overflow-auto bg-background/30"
					>
						<Terminal />
					</ResizablePanel>
				</Resizable>
				<StatusBar />
			</div>
		</main>
	)
}

export default Main
