import { Resizable, ResizableHandle, ResizablePanel } from '@repo/ui/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { dualStorage } from '@repo/utils/DualStorage'
import { useFs } from '../../fs/context/FsContext'
import { SelectedFilePanel } from './SelectedFilePanel'
import { TreeView } from './TreeView'

// const SOURCE_OPTIONS: { id: FsSource; label: string }[] = [
// 	{ id: 'local', label: 'Open Local Folder' },
// 	{ id: 'opfs', label: 'Browser Storage (OPFS)' },
// 	{ id: 'memory', label: 'Temporary Memory' }
// ]

export const Fs = () => {
	const [state, actions] = useFs()
	const focus = useFocusManager()
	let treePanel: HTMLDivElement = null!
	const storage = typeof window === 'undefined' ? undefined : dualStorage
	const [panelSizes, setPanelSizes] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal<number[]>([0.3, 0.7]),
		{
			name: 'fs-horizontal-panel-size',
			storage,
		}
	)

	onMount(() => {
		if (!treePanel) return
		const unregister = focus.registerArea('fileTree', () => treePanel)
		onCleanup(unregister)
	})

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-950/60 shadow-xl">
			<button type="button" onClick={() => void actions.pickNewRoot()}>
				Pick New Folder
			</button>
			<Resizable
				class="flex flex-1 min-h-0"
				orientation="horizontal"
				onSizesChange={(sizes) => {
					if (sizes.length !== 2) return
					setPanelSizes(() => [...sizes])
				}}
			>
				<ResizablePanel
					initialSize={panelSizes()[0] ?? 0.3}
					minSize={0.04}
					collapsible
					class="min-h-0 overflow-auto border-r border-zinc-800/70 bg-zinc-950/60"
					ref={treePanel}
				>
					<TreeView tree={() => state.tree} loading={() => state.loading} />
				</ResizablePanel>
				<ResizableHandle class="z-20" aria-label="Resize file tree" />
				<ResizablePanel
					initialSize={panelSizes()[1] ?? 0.7}
					class="flex-1 min-h-0 overflow-auto bg-zinc-950/30"
				>
					<SelectedFilePanel
						isFileSelected={() => state.lastKnownFileNode?.kind === 'file'}
						currentPath={state.lastKnownFilePath}
					/>
				</ResizablePanel>
			</Resizable>
		</div>
	)
}
