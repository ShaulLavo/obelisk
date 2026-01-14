import { Accessor, For, Show } from 'solid-js'
import type { DirTreeNode } from '@repo/fs'
import { TreeNode } from './TreeNode'
import { CreationRow } from './CreationRow'
import { useFs } from '../context/FsContext'
import { Button } from '@repo/ui/button'

type TreeViewProps = {
	tree: Accessor<DirTreeNode | undefined>
	loading: Accessor<boolean>
	onFileOpen?: (filePath: string) => void
	onFileCreate?: (filePath: string) => void
}

export const TreeView = (props: TreeViewProps) => {
	const [, actions] = useFs()

	return (
		<div class="overflow-auto h-full">
			<Show
				when={!props.loading() && props.tree()}
				fallback={
					<div class="p-2 flex flex-col gap-2">
						<Show when={!props.loading()}>
							<p class="text-ui text-muted-foreground">No filesystem loaded.</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => actions.pickNewRoot()}
							>
								Open Folder
							</Button>
						</Show>
					</div>
				}
			>
				{(tree) => (
					<>
						<For each={tree().children}>
							{(child) => <TreeNode node={child} onFileOpen={props.onFileOpen} />}
						</For>
						<CreationRow depth={1} parentPath="" onFileCreate={props.onFileCreate} />
					</>
				)}
			</Show>
		</div>
	)
}
