import type { TreeNode } from '@repo/fs'
import { batch, getOwner, onCleanup } from 'solid-js'
import { createTreePrefetchClient } from '../prefetch/treePrefetchClient'
import type {
	PrefetchDeferredMetadataPayload,
	PrefetchDirectoryLoadedPayload,
	PrefetchErrorPayload,
	PrefetchStatusPayload,
} from '../prefetch/treePrefetchWorkerTypes'
import { toast } from '@repo/ui/toaster'

const BATCH_FLUSH_INTERVAL_MS = 100
const MAX_BATCH_SIZE = 100

type PathIndexEntry = { path: string; node: TreeNode }

type MakeTreePrefetchOptions = {
	updateTreeDirectories: (updates: Array<{ path: string; children: TreeNode[]; pathIndexEntries: PathIndexEntry[] }>) => void
	setLastPrefetchedPath: (path: string | undefined) => void
	setBackgroundPrefetching: (value: boolean) => void
	setBackgroundIndexedFileCount: (value: number) => void
	setPrefetchError: (message: string | undefined) => void
	setPrefetchProcessedCount: (value: number) => void
	setPrefetchLastDurationMs: (value: number) => void
	setPrefetchAverageDurationMs: (value: number) => void
	enableCaching?: boolean
}

export const makeTreePrefetch = ({
	updateTreeDirectories,
	setLastPrefetchedPath,
	setBackgroundPrefetching,
	setBackgroundIndexedFileCount,
	setPrefetchError,
	setPrefetchProcessedCount,
	setPrefetchLastDurationMs,
	setPrefetchAverageDurationMs,
	enableCaching = true,
}: MakeTreePrefetchOptions) => {
	const handlePrefetchStatus = (status: PrefetchStatusPayload) => {
		const shouldShowPrefetching =
			status.running || status.pending > 0 || status.deferred > 0
		batch(() => {
			setBackgroundPrefetching(shouldShowPrefetching)
			setBackgroundIndexedFileCount(status.indexedFileCount)
			setPrefetchProcessedCount(status.processedCount)
			setPrefetchLastDurationMs(status.lastDurationMs)
			setPrefetchAverageDurationMs(status.averageDurationMs)
			if (!status.running && status.pending === 0 && status.deferred === 0) {
				setPrefetchError(undefined)
			}
		})
	}

	const handlePrefetchError = (payload: PrefetchErrorPayload) => {
		setPrefetchError(payload.message)
		toast.warning(payload.message)
	}

	const runPrefetchTask = (
		task: Promise<void> | undefined,
		fallbackMessage: string
	): Promise<void> | undefined => {
		if (!task) return
		return task.catch((error) => {
			handlePrefetchError({
				message: error instanceof Error ? error.message : fallbackMessage,
			})
		})
	}

	// Batch prefetch results to avoid blocking main thread with thousands of individual updates
	const pendingUpdates: PrefetchDirectoryLoadedPayload[] = []
	let flushTimeout: ReturnType<typeof setTimeout> | null = null

	const flushPendingUpdates = () => {
		flushTimeout = null
		if (pendingUpdates.length === 0) return

		const payloads = pendingUpdates.splice(0, MAX_BATCH_SIZE)
		// Convert to the format expected by updateTreeDirectories
		// Worker already computed pathIndexEntries - main thread just merges
		const updates = payloads.map((p) => ({
			path: p.node.path,
			children: p.node.children,
			pathIndexEntries: p.pathIndexEntries,
		}))

		// Single batched update for all directories - much more efficient
		updateTreeDirectories(updates)

		const lastPayload = payloads[payloads.length - 1]
		if (lastPayload) {
			setLastPrefetchedPath(lastPayload.node.path)
		}

		// If more updates pending, schedule another flush
		if (pendingUpdates.length > 0 && !flushTimeout) {
			flushTimeout = setTimeout(flushPendingUpdates, BATCH_FLUSH_INTERVAL_MS)
		}
	}

	const handlePrefetchResult = (payload: PrefetchDirectoryLoadedPayload) => {
		pendingUpdates.push(payload)

		// Schedule flush if not already scheduled
		if (!flushTimeout) {
			flushTimeout = setTimeout(flushPendingUpdates, BATCH_FLUSH_INTERVAL_MS)
		}
	}

	const handleDeferredMetadata = (_payload: PrefetchDeferredMetadataPayload) => {
		// Disabled: registerDeferredMetadata was updating a store for every deferred
		// directory (thousands in node_modules) but the data was never used anywhere.
		// This was causing main thread to hang.
	}

	const treePrefetchClient = createTreePrefetchClient(
		{
			onDirectoryLoaded: handlePrefetchResult,
			onStatus: handlePrefetchStatus,
			onError: handlePrefetchError,
			onDeferredMetadata: handleDeferredMetadata,
		},
		{
			enableCaching, // Pass through caching configuration
		}
	)
	const disposeTreePrefetchClient = () => {
		// Clear pending flush timeout
		if (flushTimeout) {
			clearTimeout(flushTimeout)
			flushTimeout = null
		}
		// Flush any remaining updates
		if (pendingUpdates.length > 0) {
			flushPendingUpdates()
		}
		return treePrefetchClient.dispose()
	}

	if (getOwner()) {
		onCleanup(() => {
			void disposeTreePrefetchClient()
		})
	}

	return {
		treePrefetchClient,
		runPrefetchTask,
		disposeTreePrefetchClient,
	}
}
