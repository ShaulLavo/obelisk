import { Accessor, For, Show } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import { TreeNode } from './TreeNode'
import { CreationRow } from './CreationRow'

type TreeViewProps = {
	tree: Accessor<FsDirTreeNode | undefined>
	loading: Accessor<boolean>
}

export const TreeView = (props: TreeViewProps) => {
	return (
		<div class="overflow-auto h-full">
			<Show
				when={!props.loading() && props.tree()}
				fallback={
					<p class="text-ui text-muted-foreground p-2">
						{props.loading() ? '' : 'No filesystem loaded.'}
					</p>
				}
			>
				{(tree) => (
					<>
						<For each={tree().children}>
							{(child) => <TreeNode node={child} />}
						</For>
						<CreationRow depth={1} parentPath="" />
					</>
				)}
			</Show>
		</div>
	)
}
