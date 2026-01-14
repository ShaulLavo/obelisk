import type { DirTreeNode, TreeNode } from '@repo/fs'
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
	node: DirTreeNode
	pathIndexEntries: PathIndexEntry[]
}

export type DeferredDirMetadata = Omit<DirTreeNode, 'children'> & {
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

export type IndexableFile = {
	path: string
	kind: 'file' | 'dir'
}

export type PathIndexEntry = {
	path: string
	node: TreeNode
}

export type DirectoryLoadResult = {
	node: DirTreeNode
	pendingTargets: PrefetchTarget[]
	fileCount: number
	filesToIndex: IndexableFile[]
	pathIndexEntries: PathIndexEntry[]
}

export type TreePrefetchWorkerApi = {
	init(payload: TreePrefetchWorkerInitPayload): Promise<void>
	loadDirectory(target: PrefetchTarget): Promise<DirectoryLoadResult | undefined>
	extractPendingTargets(tree: DirTreeNode): Promise<{
		targets: PrefetchTarget[]
		loadedPaths: string[]
		totalFileCount: number
	}>
	dispose(): Promise<void>
}
