import type { DirTreeNode, TreeNode, FilePath } from '@repo/fs'
import type { DeferredDirMetadata } from './prefetch/treePrefetchWorkerTypes'
import type { HighlightTransform, FileState } from './store/types'

export type FsSource = 'memory' | 'local' | 'opfs'

export type FsState = {
	tree?: DirTreeNode
	pathIndex: Record<FilePath, TreeNode>
	expanded: Record<FilePath, boolean>
	files: Record<FilePath, FileState>
	highlightOffsets: Record<FilePath, HighlightTransform[] | undefined>
	selectedPath?: FilePath
	activeSource: FsSource
	loading: boolean
	saving: boolean
	backgroundPrefetching: boolean
	backgroundIndexedFileCount: number
	lastPrefetchedPath?: FilePath
	prefetchError?: string
	prefetchProcessedCount: number
	prefetchLastDurationMs: number
	prefetchAverageDurationMs: number
	selectedNode?: TreeNode | undefined
	deferredMetadata: Record<FilePath, DeferredDirMetadata>
	creationState?: {
		type: 'file' | 'folder'
		parentPath: FilePath
	} | null
}
