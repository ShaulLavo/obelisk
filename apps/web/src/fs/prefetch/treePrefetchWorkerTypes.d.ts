import type { FsDirTreeNode } from '@repo/fs'
import type { FsSource } from '../types'
export type PrefetchTarget = {
	path: string
	name: string
	depth: number
	parentPath?: string
}
export type TreePrefetchWorkerInitPayload = {
	source: FsSource
	rootHandle: FileSystemDirectoryHandle
	rootPath: string
	rootName: string
}
export type PrefetchStatusMilestone = {
	processedCount: number
	pending: number
	deferred: number
	indexedFileCount: number
	lastDurationMs: number
	averageDurationMs: number
}
export type PrefetchStatusPayload = {
	running: boolean
	pending: number
	deferred: number
	indexedFileCount: number
	processedCount: number
	lastDurationMs: number
	averageDurationMs: number
	milestone?: PrefetchStatusMilestone
}
export type PrefetchDirectoryLoadedPayload = {
	node: FsDirTreeNode
}
export type DeferredDirMetadata = Omit<FsDirTreeNode, 'children'> & {
	children?: never
}
export type PrefetchDeferredMetadataPayload = {
	node: DeferredDirMetadata
}
export type PrefetchErrorPayload = {
	message: string
}
export type TreePrefetchWorkerCallbacks = {
	onDirectoryLoaded(payload: PrefetchDirectoryLoadedPayload): void
	onStatus(payload: PrefetchStatusPayload): void
	onDeferredMetadata?(payload: PrefetchDeferredMetadataPayload): void
	onError?(payload: PrefetchErrorPayload): void
}
export type TreePrefetchWorkerApi = {
	init(payload: TreePrefetchWorkerInitPayload): Promise<void>
	loadDirectory(target: PrefetchTarget): Promise<FsDirTreeNode | undefined>
	dispose(): Promise<void>
}
//# sourceMappingURL=treePrefetchWorkerTypes.d.ts.map
