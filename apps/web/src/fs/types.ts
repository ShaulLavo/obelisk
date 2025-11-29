import type { FsDirTreeNode } from '@repo/fs'

export type FsSource = 'memory' | 'local' | 'opfs'

export type FsState = {
	tree?: FsDirTreeNode
	expanded: Record<string, boolean>
	selectedPath?: string
	activeSource: FsSource
	selectedFileContent: string
	error?: string
	loading: boolean
}
