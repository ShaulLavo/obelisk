import type { TreeNode } from '@repo/fs'
import { getBracketDepthBorderClass } from '@repo/code-editor'

export const TREE_INDENT_PX = 8

export const calculateIndentationOffset = (depth: number): number =>
	Math.max(depth - 1, 0) * TREE_INDENT_PX

export const createRowIndentStyle = (
	depth: number
): { marginLeft: string; paddingLeft: string } | undefined => {
	const offset = calculateIndentationOffset(depth)
	if (offset === 0) return undefined
	const offsetPx = `${offset}px`
	return { marginLeft: `-${offsetPx}`, paddingLeft: offsetPx }
}

export const getChildBranchBorderClass = (depth: number): string =>
	getBracketDepthBorderClass(Math.max(depth + 1, 1))

export const getNodeDisplayName = (node: TreeNode): string =>
	node.kind === 'dir' ? node.name || 'root' : node.name
