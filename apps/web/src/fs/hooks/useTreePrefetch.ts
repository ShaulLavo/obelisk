import type { FsDirTreeNode } from '@repo/fs'
import { batch, getOwner, onCleanup } from 'solid-js'
import { findNode } from '../runtime/tree'
import type { FsState } from '../types'
import { createTreePrefetchClient } from '../prefetch/treePrefetchClient'
import type {
	PrefetchDeferredMetadataPayload,
	PrefetchDirectoryLoadedPayload,
	PrefetchErrorPayload,
	PrefetchStatusPayload
} from '../prefetch/treePrefetchWorkerTypes'
import { normalizeDirNodeMetadata } from '../utils/treeNodes'
import { scheduleMicrotask } from '../utils/schedule'

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

export const makeTreePrefetch = ({
	state,
	setDirNode,
	setLastPrefetchedPath,
	setBackgroundPrefetching,
	setBackgroundIndexedFileCount,
	setPrefetchError,
	setPrefetchProcessedCount,
	setPrefetchLastDurationMs,
	setPrefetchAverageDurationMs,
	registerDeferredMetadata
}: MakeTreePrefetchOptions) => {
	const handlePrefetchStatus = (status: PrefetchStatusPayload) => {
		batch(() => {
			setBackgroundPrefetching(
				status.running || status.pending > 0 || status.deferred > 0
			)
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
	}

	const runPrefetchTask = (
		task: Promise<void> | undefined,
		fallbackMessage: string
	): Promise<void> | undefined => {
		if (!task) return
		return task.catch(error => {
			handlePrefetchError({
				message: error instanceof Error ? error.message : fallbackMessage
			})
		})
	}

	const handlePrefetchResult = (payload: PrefetchDirectoryLoadedPayload) => {
		const node = payload.node
		scheduleMicrotask(() => {
			const latestTree = state.tree
			if (!latestTree) return
			const latestDir = findNode(latestTree, node.path)
			if (!latestDir || latestDir.kind !== 'dir') return
			const normalized = normalizeDirNodeMetadata(
				node,
				latestDir.parentPath,
				latestDir.depth
			)
			batch(() => {
				setDirNode(node.path, normalized)
				setLastPrefetchedPath(node.path)
			})
		})
	}

	const handleDeferredMetadata = (payload: PrefetchDeferredMetadataPayload) => {
		registerDeferredMetadata(payload.node)
	}

	const treePrefetchClient = createTreePrefetchClient({
		onDirectoryLoaded: handlePrefetchResult,
		onStatus: handlePrefetchStatus,
		onError: handlePrefetchError,
		onDeferredMetadata: handleDeferredMetadata
	})
	const disposeTreePrefetchClient = () => treePrefetchClient.dispose()

	if (getOwner()) {
		onCleanup(() => {
			void disposeTreePrefetchClient()
		})
	}

	return {
		treePrefetchClient,
		runPrefetchTask,
		disposeTreePrefetchClient
	}
}
