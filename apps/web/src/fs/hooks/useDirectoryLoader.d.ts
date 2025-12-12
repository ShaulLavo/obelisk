import type { SetStoreFunction } from 'solid-js/store'
import type { FsState } from '../types'
import type { FsDirTreeNode } from '@repo/fs'
import type { TreePrefetchClient } from '../prefetch/treePrefetchClient'
type UseDirectoryLoaderOptions = {
	state: FsState
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: (path: string | undefined) => void
	setError: (message: string | undefined) => void
	setDirNode: (path: string, node: FsDirTreeNode) => void
	runPrefetchTask: (
		task: Promise<void> | undefined,
		fallbackMessage: string
	) => void
	treePrefetchClient: TreePrefetchClient
}
type EnsureDirLoadResult = Promise<void> | undefined
export declare const useDirectoryLoader: ({
	state,
	setExpanded,
	setSelectedPath,
	setError,
	setDirNode,
	runPrefetchTask,
	treePrefetchClient,
}: UseDirectoryLoaderOptions) => {
	buildEnsurePaths: () => string[]
	ensureDirLoaded: (path: string) => EnsureDirLoadResult
	toggleDir: (path: string) => void
}
export {}
//# sourceMappingURL=useDirectoryLoader.d.ts.map
