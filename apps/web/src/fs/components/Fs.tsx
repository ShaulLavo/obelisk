import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	onCleanup
} from 'solid-js'
import { useFs } from '../../fs/context/FsContext'
import type { FsSource } from '../../fs/types'
import { SelectedFilePanel } from './SelectedFilePanel'
import { TreeView } from './TreeView'
import { useFocusManager } from '~/focus/focusManager'

const SOURCE_OPTIONS: { id: FsSource; label: string }[] = [
	{ id: 'local', label: 'Open Local Folder' },
	{ id: 'opfs', label: 'Browser Storage (OPFS)' },
	{ id: 'memory', label: 'Temporary Memory' }
]

export const Fs = () => {
	const [state, actions] = useFs()
	const focus = useFocusManager()
	const [treePanel, setTreePanel] = createSignal<HTMLDivElement | undefined>()

	const activeDirPath = createMemo(() => {
		const node = state.selectedNode
		if (!node) return ''
		return node.kind === 'dir' ? node.path : (node.parentPath ?? '')
	})

	const sourceButtonClass = (source: FsSource) =>
		[
			'rounded border px-2 py-1 text-[11px] font-medium transition',
			state.activeSource === source
				? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100 shadow-sm'
				: 'border-zinc-700/70 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
		].join(' ')

	createEffect(() => {
		const panel = treePanel()
		if (!panel) return
		const unregister = focus.registerArea('fileTree', () => panel)
		onCleanup(unregister)
	})

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-950/60 shadow-xl">
			<Show when={state.error}>
				<p class="border-b border-zinc-800/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">
					{state.error}
				</p>
			</Show>

			<div class="flex flex-1 min-h-0">
				<div
					class="w-72 min-h-0 overflow-auto border-r border-zinc-800/70 bg-zinc-950/60 px-3 py-2"
					ref={setTreePanel}
				>
					<TreeView tree={() => state.tree} loading={() => state.loading} />
				</div>
				<div class="flex-1 min-h-0 overflow-auto bg-zinc-950/30">
					<SelectedFilePanel
						isFileSelected={() => state.lastKnownFileNode?.kind === 'file'}
						currentPath={state.lastKnownFilePath}
					/>
				</div>
			</div>
		</div>
	)
}
