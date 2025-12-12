import type { FsDirTreeNode } from '@repo/fs'
export declare const normalizeDirNodeMetadata: (
	node: FsDirTreeNode,
	parentPath: string | undefined,
	depth: number
) => FsDirTreeNode
export declare const replaceDirNodeInTree: (
	current: FsDirTreeNode,
	targetPath: string,
	replacement: FsDirTreeNode
) => FsDirTreeNode
export declare const countLoadedDirectories: (root?: FsDirTreeNode) => number
//# sourceMappingURL=treeNodes.d.ts.map
