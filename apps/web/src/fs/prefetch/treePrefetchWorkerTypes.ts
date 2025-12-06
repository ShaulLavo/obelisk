import type { FsDirTreeNode } from '@repo/fs'
import type { FsSource } from '../types'

export type TreePrefetchWorkerInitPayload = {
	source: FsSource
	rootHandle: FileSystemDirectoryHandle
	rootPath: string
	rootName: string
}

export type PrefetchResult = {
	path: string
	tree?: FsDirTreeNode
}

export type TreePrefetchWorkerApi = {
	init(payload: TreePrefetchWorkerInitPayload): Promise<void>
	loadDirectory(path: string): Promise<FsDirTreeNode | undefined>
	dispose(): Promise<void>
}
