import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
export declare function findNode(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined
/**
 * Tracked version of findNode that logs slow lookups
 */
export declare function findNodeTracked(
	root?: FsDirTreeNode,
	path?: string
): FsTreeNode | undefined
//# sourceMappingURL=tree.d.ts.map
