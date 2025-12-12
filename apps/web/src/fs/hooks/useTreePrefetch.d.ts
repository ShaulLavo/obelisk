import type { FsDirTreeNode } from '@repo/fs'
import type { FsState } from '../types'
import type { PrefetchDeferredMetadataPayload } from '../prefetch/treePrefetchWorkerTypes'
type MakeTreePrefetchOptions = {
	state: FsState
	setDirNode: (path: string, node: FsDirTreeNode) => void
	setLastPrefetchedPath: (path: string | undefined) => void
	setBackgroundPrefetching: (value: boolean) => void
	setBackgroundIndexedFileCount: (value: number) => void
	setPrefetchError: (message: string | undefined) => void
	setPrefetchProcessedCount: (value: number) => void
	setPrefetchLastDurationMs: (value: number) => void
	setPrefetchAverageDurationMs: (value: number) => void
	registerDeferredMetadata: (
		node: PrefetchDeferredMetadataPayload['node']
	) => void
}
export declare const makeTreePrefetch: ({
	state,
	setDirNode,
	setLastPrefetchedPath,
	setBackgroundPrefetching,
	setBackgroundIndexedFileCount,
	setPrefetchError,
	setPrefetchProcessedCount,
	setPrefetchLastDurationMs,
	setPrefetchAverageDurationMs,
	registerDeferredMetadata,
}: MakeTreePrefetchOptions) => {
	treePrefetchClient: import('../prefetch/treePrefetchClient').TreePrefetchClient
	runPrefetchTask: (
		task: Promise<void> | undefined,
		fallbackMessage: string
	) => Promise<void> | undefined
	disposeTreePrefetchClient: () => Promise<void>
}
export {}
//# sourceMappingURL=useTreePrefetch.d.ts.map
