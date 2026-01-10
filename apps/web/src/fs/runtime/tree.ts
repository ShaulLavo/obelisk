import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { trackMicro } from '@repo/perf'

const TREE_TIMING_THRESHOLD = 1 // ms

/**
 * Normalize a path by stripping leading slashes.
 * Tree nodes use paths without leading slashes (e.g., ".system/userSettings.json")
 * but UI code often uses paths with leading slashes ("/.system/userSettings.json").
 */
const normalizePath = (path: string): string => {
	return path.startsWith('/') ? path.slice(1) : path
}

export function findNode(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined {
	if (!root || path === undefined) return undefined
	
	const normalizedPath = normalizePath(path)
	if (root.path === normalizedPath) return root

	const stack: FsDirTreeNode[] = [root]

	while (stack.length) {
		const dir = stack.pop()!
		const children = dir.children
		if (!children || children.length === 0) continue

		for (const child of children) {
			if (child.path === normalizedPath) return child
			if (child.kind === 'dir') {
				stack.push(child)
			}
		}
	}

	return undefined
}

export function findNodeTracked(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined {
	return trackMicro('tree:findNode', () => findNode(root, path), {
		metadata: { path },
		threshold: TREE_TIMING_THRESHOLD,
	})
}
