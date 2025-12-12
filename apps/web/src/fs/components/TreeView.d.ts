import { Accessor } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
type TreeViewProps = {
	tree: Accessor<FsDirTreeNode | undefined>
	loading: Accessor<boolean>
}
export declare const TreeView: (
	props: TreeViewProps
) => import('solid-js').JSX.Element
export {}
//# sourceMappingURL=TreeView.d.ts.map
