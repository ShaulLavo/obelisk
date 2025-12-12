import type { FsDirTreeNode } from '@repo/fs'
import type { FsSource } from '../types'
import type {
	PrefetchTarget,
	TreePrefetchWorkerCallbacks,
} from './treePrefetchWorkerTypes'
type PrefetchQueueOptions = {
	workerCount: number
	loadDirectory: (target: PrefetchTarget) => Promise<FsDirTreeNode | undefined>
	callbacks: TreePrefetchWorkerCallbacks
}
export declare class PrefetchQueue {
	private readonly options
	private readonly primaryQueue
	private readonly deferredQueue
	private readonly loadedDirPaths
	private readonly loadedDirFileCounts
	private readonly pendingResults
	private sessionPrefetchCount
	private processedCount
	private totalDurationMs
	private lastDurationMs
	private indexedFileCount
	private primaryPhaseComplete
	private running
	private stopRequested
	private disposed
	private drainPromise
	private sessionToken
	private source
	private runStartTime
	private readonly workerCount
	private loggedProcessedCount
	private loggedIndexedCount
	private readonly activeJobs
	private readonly loggedDeferredPaths
	private deferredBytesTotal
	private deferredSample
	private primaryPhaseLogged
	private deferredPhaseLogged
	constructor(options: PrefetchQueueOptions)
	resetForSource(source: FsSource): Promise<void>
	seedTree(tree?: FsDirTreeNode): Promise<void>
	enqueueSubtree(node: FsDirTreeNode): void
	markDirLoaded(path: string | undefined): void
	dispose(): Promise<void>
	private clearState
	private hasPrefetchBudget
	private hasPendingTargets
	private shouldDeferPath
	private shouldSkipTarget
	private enqueueTargets
	private scheduleProcessing
	private takeFromQueue
	private dequeueNextTarget
	private flushPhaseResults
	private markPrimaryPhaseComplete
	private logDeferredPayload
	private workerLoop
	private dropTargetFromQueues
	private trackLoadedDirectory
	private ingestLoadedSubtree
	private emitStatus
	private logCompletion
	private logPhaseCompletion
}
export {}
//# sourceMappingURL=prefetchQueue.d.ts.map
