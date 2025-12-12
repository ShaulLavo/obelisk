import type { FsDirTreeNode } from '@repo/fs'
import type { FsSource } from '../types'
type RestoreHandleCacheParams = {
	tree: FsDirTreeNode | undefined
	activeSource?: FsSource
}
export declare const restoreHandleCache: ({
	tree,
	activeSource,
}: RestoreHandleCacheParams) => void
export {}
//# sourceMappingURL=handleCache.d.ts.map
