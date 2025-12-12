import { For, Show } from 'solid-js'
import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { getBracketDepthBorderClass } from '@repo/code-editor'
import { useFs } from '../../fs/context/FsContext'
import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'
import { VsFile } from '@repo/icons/vs/VsFile'
import { VsFolder } from '@repo/icons/vs/VsFolder'
import { VsFolderOpened } from '@repo/icons/vs/VsFolderOpened'

const TREE_INDENT_PX = 8

type TreeNodeProps = {
	node: FsTreeNode
	hasParent?: boolean
}

export const TreeNode = (props: TreeNodeProps) => {
	const [state, actions] = useFs()
	const isDir = () => props.node.kind === 'dir'
	const isSelected = () => state.selectedPath === props.node.path
	const isOpen = () => isDir() && state.expanded[props.node.path]
	const indentationOffset = () =>
		Math.max(props.node.depth - 1, 0) * TREE_INDENT_PX
	const rowIndentStyle = () => {
		const offset = indentationOffset()
		if (offset === 0) return undefined
		const offsetPx = `${offset}px`
		return {
			marginLeft: `-${offsetPx}`,
			paddingLeft: offsetPx
		}
	}

	const childBranchBorderClass = () =>
		getBracketDepthBorderClass(Math.max(props.node.depth + 1, 1))

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
		<div>
			<div class="relative group peer" style={rowIndentStyle()}>
				<span
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 rounded border transition-colors duration-150 ease-in-out"
					classList={{
						'border-cyan-700': isSelected(),
						'border-transparent': !isSelected(),
						'group-hover:bg-zinc-800/50': !isSelected()
					}}
				/>
				{/* <Show when={showBranch()}>
					<span
						aria-hidden="true"
						class="pointer-events-none absolute left-1 top-1/2 w-2.5 translate-y-1/2 border-t opacity-0 group-hover:opacity-80"
						classList={{ [branchBorderClass()]: true }}
					/>
				</Show> */}
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
					class="relative z-10 flex w-full items-center overflow-hidden rounded text-left text-sm transition"
				>
					<span
						class="w-4 text-center text-[10px] text-zinc-500"
						classList={{ 'text-cyan-700': isSelected() }}
					>
						{isDir() ? isOpen() ? <VsChevronDown /> : <VsChevronRight /> : ''}
					</span>
					<span
						class="mr-2 flex items-center justify-center"
						classList={{ 'text-cyan-700': isSelected() }}
					>
						<Show when={isDir()} fallback={<VsFile size={16} />}>
							<Show when={isOpen()} fallback={<VsFolder size={16} />}>
								<VsFolderOpened size={16} />
							</Show>
						</Show>
					</span>
					<span
						class="truncate text-zinc-200"
						classList={{ 'text-cyan-700': isSelected() }}
					>
						{isDir() ? props.node.name || 'root' : props.node.name}
					</span>
				</button>
			</div>

			<Show when={isDir() && isOpen()}>
				<div class="relative pl-2">
					<span
						aria-hidden="true"
						class="pointer-events-none absolute left-1.5 top-0 bottom-0 z-10 border-l opacity-0 transition-opacity duration-200 ease-linear peer-hover:opacity-40"
						classList={{ [childBranchBorderClass()]: true }}
					/>
					<For each={(props.node as FsDirTreeNode).children}>
						{child => <TreeNode node={child} hasParent />}
					</For>
				</div>
			</Show>
		</div>
	)
}
