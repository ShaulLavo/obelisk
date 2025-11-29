import { For, Show, createMemo } from 'solid-js'
import type { FsTreeNode } from '@repo/fs'
import { findNode, useFs } from '../../fs/FsContext'
import type { FsSource } from '../../fs/types'
import { SelectedFilePanel } from './SelectedFilePanel'
import { TreeView } from './TreeView'

const SOURCE_OPTIONS: { id: FsSource; label: string }[] = [
	{ id: 'local', label: 'Open Local Folder' },
	{ id: 'opfs', label: 'Browser Storage (OPFS)' },
	{ id: 'memory', label: 'Temporary Memory' }
]

export const Fs = () => {
	const [state, actions] = useFs()

	const selectedNode = createMemo<FsTreeNode | undefined>(() =>
		state.tree ? findNode(state.tree, state.selectedPath) : undefined
	)

	const activeDirPath = createMemo(() => {
		const node = selectedNode()
		if (!node) return ''
		return node.kind === 'dir' ? node.path : (node.parentPath ?? '')
	})

	const activeFileContent = createMemo(() => {
		const node = selectedNode()
		if (!node || node.kind !== 'file') return ''
		return state.selectedFileContent
	})

	const sourceButtonClass = (source: FsSource) =>
		[
			'rounded border px-2 py-1 text-[11px] font-medium transition',
			state.activeSource === source
				? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100 shadow-sm'
				: 'border-zinc-700/70 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
		].join(' ')

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-950/60 shadow-xl">
			<div class="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-900/70 px-3 py-2 text-xs uppercase tracking-[0.08em] text-zinc-400">
				<div class="flex items-center gap-2 truncate">
					<span class="rounded bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-100">
						{SOURCE_OPTIONS.find(option => option.id === state.activeSource)
							?.label || 'Filesystem'}
					</span>
					<span class="rounded bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-100">
						{state.tree?.name || 'root'}
					</span>
					<span class="truncate font-mono text-[11px] lowercase text-zinc-500">
						{activeDirPath() || '/'}
					</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="flex items-center gap-1">
						<For each={SOURCE_OPTIONS}>
							{option => (
								<button
									type="button"
									class={sourceButtonClass(option.id)}
									onMouseDown={() => void actions.setSource(option.id)}
								>
									{option.label}
								</button>
							)}
						</For>
					</div>
					<button
						type="button"
						class="rounded border border-zinc-700/70 bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-100 hover:bg-zinc-700"
						onMouseDown={() => void actions.refresh()}
					>
						Refresh
					</button>
				</div>
			</div>

			<Show when={state.error}>
				<p class="border-b border-zinc-800/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">
					{state.error}
				</p>
			</Show>

			<div class="flex flex-1 min-h-0">
				<div class="w-72 min-h-0 overflow-auto border-r border-zinc-800/70 bg-zinc-950/60 px-3 py-2">
					<TreeView tree={() => state.tree} loading={() => state.loading} />
				</div>
				<div class="flex-1 min-h-0 overflow-auto bg-zinc-950/30 px-3 py-2">
					<SelectedFilePanel
						isFileSelected={() => selectedNode()?.kind === 'file'}
						content={activeFileContent}
					/>
				</div>
			</div>
		</div>
	)
}
