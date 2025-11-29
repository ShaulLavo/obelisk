import { Accessor, Show } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import { TreeNode } from './TreeNode'

type TreeViewProps = {
	tree: Accessor<FsDirTreeNode | undefined>
	loading: Accessor<boolean>
}

export const TreeView = (props: TreeViewProps) => (
	<div class="">
		<p class="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
			Tree
		</p>
		<Show
			when={!props.loading() && props.tree()}
			fallback={
				<p class="text-sm text-zinc-500">
					{props.loading() ? 'Loading filesystem...' : 'No filesystem loaded.'}
				</p>
			}
		>
			{tree => <TreeNode node={tree()} />}
		</Show>
	</div>
)
