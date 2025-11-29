import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'

export function findNode(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined {
	if (!root || path === undefined) return undefined
	if (root.path === path) return root
	const children = Array.isArray(root.children) ? root.children : []
	for (const child of children) {
		if (child.path === path) return child
		if (child.kind === 'dir') {
			const match = findNode(child as FsDirTreeNode, path)
			if (match) return match
		}
	}
	return undefined
}
