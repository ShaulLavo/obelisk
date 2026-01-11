import { For, Show } from 'solid-js'
import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { useFs } from '../context/FsContext'
import { useTreeNodeHover } from '../hooks/useTreeNodeHover'
import { useBranchLineTransition } from '../hooks/useBranchLineTransition'
import {
	calculateIndentationOffset,
	getChildBranchBorderClass,
} from '../utils/treeNodeUtils'
import { TreeNodeRow } from './TreeNodeRow'
import { TreeNodeButton } from './TreeNodeButton'
import { CreationRow } from './CreationRow'

type TreeNodeProps = {
	node: FsTreeNode
	hasParent?: boolean
	onHover?: (hovered: boolean) => void
	onFileOpen?: (filePath: string) => void
	onFileCreate?: (filePath: string) => void
}

export const TreeNode = (props: TreeNodeProps) => {
	const [state, actions] = useFs()

	const isDir = () => props.node.kind === 'dir'
	const isSelected = () => actions.isSelectedPath(props.node.path)
	const isOpen = () => isDir() && Boolean(state.expanded[props.node.path])

	const { showBranchLine, handleRowHover, handleChildHover } = useTreeNodeHover(
		{
			isOpen,
			onHover: (b: boolean) => props.onHover?.(b),
		}
	)

	const { setBranchLineRef } = useBranchLineTransition({
		isOpen,
		showBranchLine,
	})

	const indentationOffset = () => calculateIndentationOffset(props.node.depth)
	const childBranchBorderClass = () =>
		getChildBranchBorderClass(props.node.depth)

	const handleClick = () => {
		if (isDir()) {
			actions.toggleDir(props.node.path)
		} else {
			// Use the new tab-based file opening if available
			if (props.onFileOpen) {
				props.onFileOpen(props.node.path)
			} else {
				// Fallback to traditional selection
				void actions.selectPath(props.node.path)
			}
		}
	}

	return (
		<>
			<TreeNodeRow
				depth={props.node.depth}
				indentationOffset={indentationOffset()}
				isSelected={isSelected()}
				onMouseEnter={() => handleRowHover(true)}
				onMouseLeave={() => handleRowHover(false)}
			>
				<TreeNodeButton
					node={props.node}
					isDir={isDir()}
					isOpen={isOpen()}
					isSelected={isSelected()}
					onClick={handleClick}
				/>
			</TreeNodeRow>

			<Show when={isDir() && isOpen()}>
				<div class="relative pl-2">
					<span
						ref={setBranchLineRef}
						aria-hidden="true"
						class={`tree-node-branch-line ${childBranchBorderClass()}`}
						style={{ opacity: 0 }}
					/>
					<For each={(props.node as FsDirTreeNode).children}>
						{(child) => (
							<TreeNode node={child} hasParent onHover={handleChildHover} onFileOpen={props.onFileOpen} onFileCreate={props.onFileCreate} />
						)}
					</For>
					<CreationRow
						depth={props.node.depth + 1}
						parentPath={props.node.path}
						onFileCreate={props.onFileCreate}
					/>
				</div>
			</Show>
		</>
	)
}
