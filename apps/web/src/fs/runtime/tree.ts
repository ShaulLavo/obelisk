import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'

export function findNode(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined {
	if (!root || path === undefined) return undefined
	if (root.path === path) return root

	const stack: FsDirTreeNode[] = [root]

	while (stack.length) {
		const dir = stack.pop()!
		const children = dir.children
		if (!children || children.length === 0) continue

		for (const child of children) {
			if (child.path === path) return child
			if (child.kind === 'dir') {
				stack.push(child)
			}
		}
	}

	return undefined
}
