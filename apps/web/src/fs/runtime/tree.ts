import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { trackMicro } from '@repo/perf'

const TREE_TIMING_THRESHOLD = 1 // ms

// Path index for O(1) lookups
// WeakMap keyed by root node to allow garbage collection when tree changes
const treeIndexCache = new WeakMap<FsDirTreeNode, Map<string, FsTreeNode>>()
const pendingIndexBuilds = new WeakSet<FsDirTreeNode>()

/**
 * Build index incrementally, yielding periodically to avoid blocking.
 */
function buildIndexAsync(root: FsDirTreeNode): void {
	if (pendingIndexBuilds.has(root) || treeIndexCache.has(root)) return
	pendingIndexBuilds.add(root)

	const index = new Map<string, FsTreeNode>()
	const stack: FsTreeNode[] = [root]
	const CHUNK_SIZE = 500

	const processChunk = () => {
		// Check if root was replaced (garbage collected scenario)
		if (treeIndexCache.has(root)) return

		let processed = 0
		while (stack.length && processed < CHUNK_SIZE) {
			const node = stack.pop()!
			if (node.path) {
				index.set(node.path, node)
			}
			if (node.kind === 'dir' && node.children) {
				for (const child of node.children) {
					stack.push(child)
				}
			}
			processed++
		}

		if (stack.length > 0) {
			// More to process - schedule next chunk
			if (typeof requestIdleCallback === 'function') {
				requestIdleCallback(processChunk, { timeout: 100 })
			} else {
				setTimeout(processChunk, 0)
			}
		} else {
			// Done - store the index
			treeIndexCache.set(root, index)
			pendingIndexBuilds.delete(root)
		}
	}

	// Start processing immediately for first chunk, then yield
	processChunk()
}

/**
 * Get cached index if available.
 */
function getCachedIndex(root: FsDirTreeNode): Map<string, FsTreeNode> | undefined {
	return treeIndexCache.get(root)
}

export function findNode(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined {
	if (!root || path === undefined) return undefined

	const normalizedPath = createFilePath(path)
	if (root.path === normalizedPath) return root

	// Try cached index first
	const index = getCachedIndex(root)
	if (index) {
		return index.get(normalizedPath)
	}

	// Trigger async index build for future lookups
	buildIndexAsync(root)

	// Fall back to linear search for this lookup
	return findNodeLinearInternal(root, normalizedPath)
}

/**
 * Internal linear search with pre-normalized path.
 */
function findNodeLinearInternal(
	root: FsDirTreeNode,
	normalizedPath: string
): FsTreeNode | undefined {
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

/**
 * Original O(n) findNode implementation for cases where index isn't beneficial.
 * Use this for one-off lookups where building an index would be wasteful.
 */
export function findNodeLinear(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined {
	if (!root || path === undefined) return undefined

	const normalizedPath = createFilePath(path)
	if (root.path === normalizedPath) return root

	return findNodeLinearInternal(root, normalizedPath)
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
