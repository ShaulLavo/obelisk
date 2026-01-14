import type { DirTreeNode } from '@repo/fs'

export const normalizeDirNodeMetadata = (
	node: DirTreeNode,
	parentPath: string | undefined,
	depth: number
): DirTreeNode => {
	const childParentPath = node.path || undefined
	return {
		...node,
		parentPath,
		depth,
		children: node.children.map((child) => {
			if (child.kind === 'dir') {
				return normalizeDirNodeMetadata(child, childParentPath, depth + 1)
			}

			return {
				...child,
				parentPath: childParentPath,
				depth: depth + 1,
			}
		}),
	}
}
