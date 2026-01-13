import type { FsDirTreeNode } from '@repo/fs'

export const normalizeDirNodeMetadata = (
	node: FsDirTreeNode,
	parentPath: string | undefined,
	depth: number
): FsDirTreeNode => {
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

export const replaceDirNodeInTree = (
	current: FsDirTreeNode,
	targetPath: string,
	replacement: FsDirTreeNode
): FsDirTreeNode => {
	if (current.path === targetPath) {
		return replacement
	}

	let changed = false
	const children = current.children.map((child) => {
		if (child.kind !== 'dir') return child
		const shouldDescend =
			child.path === targetPath || targetPath.startsWith(`${child.path}/`)
		if (!shouldDescend) return child
		const next = replaceDirNodeInTree(child, targetPath, replacement)
		if (next !== child) {
			changed = true
		}
		return next
	})

	if (!changed) {
		return current
	}

	return {
		...current,
		children,
	}
}

/**
 * Build a set of all ancestor paths for a collection of paths.
 * For path "a/b/c", adds "a" and "a/b" to the set.
 * Used for O(1) "has descendant" checks during tree traversal.
 */
const buildAncestorPaths = (paths: Iterable<string>): Set<string> => {
	const ancestors = new Set<string>()
	for (const path of paths) {
		const parts = path.split('/')
		let current = ''
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i]!
			current = current ? `${current}/${part}` : part
			ancestors.add(current)
		}
	}
	return ancestors
}

/**
 * Batch replace multiple directory nodes in a single tree traversal.
 * Much more efficient than calling replaceDirNodeInTree multiple times.
 */
export const batchReplaceDirNodes = (
	root: FsDirTreeNode,
	replacements: Map<string, FsDirTreeNode>
): FsDirTreeNode => {
	if (replacements.size === 0) return root

	// Pre-compute ancestor paths for O(1) "has descendant" checks
	const ancestorPaths = buildAncestorPaths(replacements.keys())
	// Track which paths we've processed (don't mutate the input map)
	const remaining = new Set(replacements.keys())

	const traverse = (current: FsDirTreeNode): FsDirTreeNode => {
		// Check if current node should be replaced
		if (remaining.has(current.path)) {
			const replacement = replacements.get(current.path)!
			remaining.delete(current.path)
			// If no more replacements, return the replacement directly
			if (remaining.size === 0) return replacement
			// Otherwise, continue processing children of the replacement
			return traverse(replacement)
		}

		// Early exit if nothing left to replace
		if (remaining.size === 0) return current

		// Check which children might contain targets
		let changed = false
		const children = current.children.map((child) => {
			if (child.kind !== 'dir') return child
			if (remaining.size === 0) return child

			// Check if this child is a target
			if (remaining.has(child.path)) {
				const childReplacement = replacements.get(child.path)!
				remaining.delete(child.path)
				changed = true
				// Continue processing if more replacements exist
				if (remaining.size > 0) {
					return traverse(childReplacement)
				}
				return childReplacement
			}

			// O(1) check: is this path an ancestor of any remaining target?
			if (!ancestorPaths.has(child.path)) return child

			const next = traverse(child)
			if (next !== child) {
				changed = true
			}
			return next
		})

		if (!changed) {
			return current
		}

		return {
			...current,
			children,
		}
	}

	return traverse(root)
}

export const countLoadedDirectories = (root?: FsDirTreeNode) => {
	if (!root) return 0
	let count = 0
	const stack: FsDirTreeNode[] = [root]
	while (stack.length) {
		const dir = stack.pop()!
		if (dir.isLoaded !== false) {
			count += 1
		}
		for (const child of dir.children) {
			if (child.kind === 'dir') {
				stack.push(child)
			}
		}
	}
	return count
}
