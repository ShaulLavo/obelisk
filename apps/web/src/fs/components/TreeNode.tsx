import { For, Show } from 'solid-js'
import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { useFs } from '../../fs/context/FsContext'
import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'
import { VsFile } from '@repo/icons/vs/VsFile'
import { VsFolder } from '@repo/icons/vs/VsFolder'
import { VsFolderOpened } from '@repo/icons/vs/VsFolderOpened'

type TreeNodeProps = {
	node: FsTreeNode
	hasParent?: boolean
}

export const TreeNode = (props: TreeNodeProps) => {
	const [state, actions] = useFs()
	const isDir = () => props.node.kind === 'dir'
	const isSelected = () => state.selectedPath === props.node.path
	const isOpen = () => isDir() && state.expanded[props.node.path]
	const hasParent = () => !!props.hasParent
	const showBranch = () => hasParent() && !isDir()

	const handleDirClick = () => {
		actions.toggleDir(props.node.path)
	}

	const handleSelect = () => {
		void actions.selectPath(props.node.path, { forceReload: true })
	}

	const handleClick = () => {
		if (isDir()) {
			handleDirClick()
		} else {
			handleSelect()
		}
	}

	return (
		<div>
			<div class="relative">
				<Show when={showBranch()}>
					<span
						aria-hidden="true"
						class="pointer-events-none absolute left-1 top-1/2 w-2.5 translate-y-1/2 border-t border-zinc-800"
					/>
				</Show>
				{/* TODO: Move keyboard controls (Enter/Space to toggle) to keyboard manager */}
				<button
					type="button"
					onMouseDown={handleClick}
					onKeyDown={e => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault()
							handleClick()
						}
					}}
					aria-expanded={isDir() ? isOpen() : undefined}
					class={`flex w-full items-center overflow-hidden rounded border border-transparent  text-left text-sm transition hover:border-zinc-700/60 hover:bg-zinc-800/30 ${
						isSelected() ? 'border-zinc-700 bg-zinc-900/50' : ''
					}`}
				>
					<span class="w-4 text-center text-[10px] text-zinc-500">
						{isDir() ? isOpen() ? <VsChevronDown /> : <VsChevronRight /> : ''}
					</span>
					<span class="mr-2 flex items-center justify-center ">
						<Show when={isDir()} fallback={<VsFile size={16} />}>
							<Show when={isOpen()} fallback={<VsFolder size={16} />}>
								<VsFolderOpened size={16} />
							</Show>
						</Show>
					</span>
					<span class="truncate text-zinc-200">
						{isDir() ? props.node.name || 'root' : props.node.name}
					</span>
				</button>
			</div>
			<Show when={isDir() && isOpen()}>
				<div class="relative pl-2">
					<span
						aria-hidden="true"
						class="pointer-events-none absolute left-1.5 top-0 bottom-0 border-l border-zinc-800"
					/>
					<For each={(props.node as FsDirTreeNode).children}>
						{child => <TreeNode node={child} hasParent />}
					</For>
				</div>
			</Show>
		</div>
	)
}
