import type { FsContext, FsDirTreeNode, FsTreeNode } from '@repo/fs'
import type { LocalEchoController } from './localEcho'
import type { FsSource, FsState } from '../fs/types'
import type { PathIndex } from '../fs/hooks/createTreeState'
import type { FsActions } from '../fs/context/FsContext'

export type ShellState = {
	tree: FsDirTreeNode | undefined
	pathIndex: PathIndex
	activeSource: FsSource | undefined
}

export type Shell = {
	state: ShellState
	getCwd: () => string
	getVfsContext: () => Promise<FsContext>
}

export type CommandContext = {
	shell: Shell
	localEcho?: LocalEchoController
}

export type ShellContext = {
	state: FsState
	actions: FsActions
	getCwd: () => string
	setCwd: (path: string) => void
	getVfsContext: () => Promise<FsContext>
}
