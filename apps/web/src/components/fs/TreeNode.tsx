import { For, Show } from 'solid-js'
import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { useFs } from '../../fs/FsContext'

export const TreeNode = (props: { node: FsTreeNode }) => {
	const [state, actions] = useFs()
	const isDir = () => props.node.kind === 'dir'
	const isSelected = () => state.selectedPath === props.node.path
	const isOpen = () => (isDir() ? state.expanded[props.node.path] : false)

	const handleDirClick = () => {
		actions.toggleDir(props.node.path)
	}

	const handleSelect = () => {
		void actions.selectPath(props.node.path)
	}

	const handleClick = () => {
		if (isDir()) {
			handleDirClick()
		} else {
			handleSelect()
		}
	}

	return (
		<div class="">
			<button
				type="button"
				onMouseDown={handleClick}
				aria-expanded={isDir() ? isOpen() : undefined}
				class={`flex w-full items-center overflow-hidden rounded border border-transparent text-left text-sm transition hover:border-zinc-700/60 hover:bg-zinc-800/30 ${
					isSelected() ? 'border-zinc-700 bg-zinc-900/50' : ''
				}`}
			>
				<span
					class={`w-4 text-center text-xs ${isDir() ? '' : 'text-zinc-500'}`}
				>
					{isDir() ? (isOpen() ? '▾' : '▸') : '•'}
				</span>
				<span class="truncate text-zinc-200">
					{isDir() ? props.node.name || 'root' : props.node.name}
				</span>
			</button>
			<Show when={isDir() && isOpen()}>
				<div class="border-l border-zinc-800 pl-1">
					<For each={(props.node as FsDirTreeNode).children}>
						{child => <TreeNode node={child} />}
					</For>
				</div>
			</Show>
		</div>
	)
}
