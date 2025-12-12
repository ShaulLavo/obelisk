import type { FsDirTreeNode } from '@repo/fs'
import type {
	TreePrefetchWorkerCallbacks,
	TreePrefetchWorkerInitPayload,
} from './treePrefetchWorkerTypes'
export type TreePrefetchClient = {
	init(payload: TreePrefetchWorkerInitPayload): Promise<void>
	seedTree(tree: FsDirTreeNode): Promise<void>
	ingestSubtree(node: FsDirTreeNode): Promise<void>
	markDirLoaded(path: string): Promise<void>
	dispose(): Promise<void>
}
export declare const createTreePrefetchClient: (
	callbacks: TreePrefetchWorkerCallbacks
) => TreePrefetchClient
//# sourceMappingURL=treePrefetchClient.d.ts.map
