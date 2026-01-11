import type { FsTreeNode } from '@repo/fs'
import { Button } from '@repo/ui/button'
import { TreeNodeIcon } from './TreeNodeIcon'
import { getNodeDisplayName } from '../utils/treeNodeUtils'

type TreeNodeButtonProps = {
	node: FsTreeNode
	isDir: boolean
	isOpen: boolean
	isSelected: boolean
	onClick: () => void
}

export const TreeNodeButton = (props: TreeNodeButtonProps) => {
	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			props.onClick()
		}
	}

	return (
		<Button
			variant="ghost"
			onMouseDown={props.onClick}
			onKeyDown={handleKeyDown}
			aria-expanded={props.isDir ? props.isOpen : undefined}
			class="tree-node-button justify-start gap-0 h-auto min-h-0 p-0 font-normal text-ui hover:bg-transparent text-foreground hover:text-foreground"
		>
			<TreeNodeIcon
				isDir={props.isDir}
				isOpen={props.isOpen}
				name={props.node.name}
				isSelected={props.isSelected}
			/>
			<span
				class="truncate text-foreground"
				classList={{ 'text-cyan-700': props.isSelected }}
			>
				{getNodeDisplayName(props.node)}
			</span>
		</Button>
	)
}
