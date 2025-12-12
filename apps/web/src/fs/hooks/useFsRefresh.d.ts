import type { FsDirTreeNode } from '@repo/fs'
import type { SetStoreFunction } from 'solid-js/store'
import type { FsState, FsSource } from '../types'
import type { TreePrefetchClient } from '../prefetch/treePrefetchClient'
type UseFsRefreshOptions = {
	state: FsState
	setTree: SetStoreFunction<FsDirTreeNode>
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setActiveSource: (source: FsSource) => void
	setError: (message: string | undefined) => void
	setLoading: (value: boolean) => void
	clearParseResults: () => void
	clearPieceTables: () => void
	clearFileCache: () => void
	clearDeferredMetadata: () => void
	setBackgroundPrefetching: (value: boolean) => void
	setBackgroundIndexedFileCount: (value: number) => void
	setLastPrefetchedPath: (path: string | undefined) => void
	ensureDirLoaded: (path: string) => Promise<void> | undefined
	buildEnsurePaths: () => string[]
	treePrefetchClient: TreePrefetchClient
	runPrefetchTask: (
		task: Promise<void> | undefined,
		fallbackMessage: string
	) => void
	selectPath: (
		path: string,
		options?: {
			forceReload?: boolean
		}
	) => Promise<void>
}
export declare const useFsRefresh: ({
	state,
	setTree,
	setExpanded,
	setActiveSource,
	setError,
	setLoading,
	clearParseResults,
	clearPieceTables,
	clearFileCache,
	clearDeferredMetadata,
	setBackgroundPrefetching,
	setBackgroundIndexedFileCount,
	setLastPrefetchedPath,
	ensureDirLoaded,
	buildEnsurePaths,
	treePrefetchClient,
	runPrefetchTask,
	selectPath,
}: UseFsRefreshOptions) => {
	refresh: (initialSource?: FsSource) => Promise<void>
}
export {}
//# sourceMappingURL=useFsRefresh.d.ts.map
