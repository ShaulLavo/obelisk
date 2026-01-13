import { batch, getOwner, onCleanup } from 'solid-js'
import { createTreePrefetchClient } from '../prefetch/treePrefetchClient'
import type {
	PrefetchDeferredMetadataPayload,
	PrefetchDirectoryLoadedPayload,
	PrefetchErrorPayload,
	PrefetchStatusPayload,
} from '../prefetch/treePrefetchWorkerTypes'
import { toast } from '@repo/ui/toaster'
import type { ReactiveTree } from '../tree/ReactiveTree'

type MakeTreePrefetchOptions = {
	reactiveTree: ReactiveTree
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
	reactiveTree,
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

	const handlePrefetchResult = (payload: PrefetchDirectoryLoadedPayload) => {
		// O(1) update: Map lookup + signal set
		reactiveTree.updateDirectory(payload.node.path, payload.node.children)
		setLastPrefetchedPath(payload.node.path)
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
	const disposeTreePrefetchClient = () => treePrefetchClient.dispose()

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
