import { Resizable, ResizableHandle, ResizablePanel } from '@repo/ui/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useFocusManager } from '~/focus/focusManager'
import { dualStorage } from '~/utils/DualStorage'
import { useFs } from '../../fs/context/FsContext'
import { SelectedFilePanel } from './SelectedFilePanel'
import { TreeView } from './TreeView'

// const SOURCE_OPTIONS: { id: FsSource; label: string }[] = [
// 	{ id: 'local', label: 'Open Local Folder' },
// 	{ id: 'opfs', label: 'Browser Storage (OPFS)' },
// 	{ id: 'memory', label: 'Temporary Memory' }
// ]

export const Fs = () => {
	const [state] = useFs()
	const focus = useFocusManager()
	let treePanel: HTMLDivElement = null!
	const storage = typeof window === 'undefined' ? undefined : dualStorage
	const [panelSizes, setPanelSizes] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal<number[]>([0.3, 0.7]),
		{
			name: 'fs-horizontal-panel-size',
			storage
		}
	)

	// const activeDirPath = createMemo(() => {
	// 	const node = state.selectedNode
	// 	if (!node) return ''
	// 	return node.kind === 'dir' ? node.path : (node.parentPath ?? '')
	// })

	// const sourceButtonClass = (source: FsSource) =>
	// 	[
	// 		'rounded border px-2 py-1 text-[11px] font-medium transition',
	// 		state.activeSource === source
	// 			? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100 shadow-sm'
	// 			: 'border-zinc-700/70 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
	// 	].join(' ')

	onMount(() => {
		if (!treePanel) return
		const unregister = focus.registerArea('fileTree', () => treePanel)
		onCleanup(unregister)
	})

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-950/60 shadow-xl">
			<Show when={state.error}>
				<p class="border-b border-zinc-800/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">
					{state.error}
				</p>
			</Show>

			<Resizable
				class="flex flex-1 min-h-0"
				orientation="horizontal"
				onSizesChange={sizes => {
					if (sizes.length !== 2) return
					setPanelSizes(() => [...sizes])
				}}
			>
				<ResizablePanel
					initialSize={panelSizes()[0] ?? 0.3}
					minSize={0.18}
					class="min-h-0 overflow-auto border-r border-zinc-800/70 bg-zinc-950/60"
					ref={treePanel}
				>
					<TreeView tree={() => state.tree} loading={() => state.loading} />
				</ResizablePanel>
				<ResizableHandle aria-label="Resize file tree" />
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
