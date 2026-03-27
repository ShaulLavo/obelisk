import type { DirTreeNode } from '@repo/fs'
import { getDefaultSource } from '../config/constants'
import type { FsSource } from '../types'
import { primeFsCache } from './fsRuntime'

/** Shared cache of resolved file handles, keyed by normalized file path. */
export const fileHandleCache = new Map<string, FileSystemFileHandle>()

const isValidDirectoryHandle = (
	handle: unknown
): handle is FileSystemDirectoryHandle => {
	if (!handle || typeof handle !== 'object') return false
	const h = handle as { entries?: unknown; [Symbol.asyncIterator]?: unknown }
	return (
		typeof h.entries === 'function' ||
		typeof h[Symbol.asyncIterator] === 'function'
	)
}

type RestoreHandleCacheParams = {
	tree: DirTreeNode | undefined
	activeSource?: FsSource
}

export const restoreHandleCache = ({
	tree,
	activeSource,
}: RestoreHandleCacheParams) => {
	if (!tree) return

	const source = activeSource ?? getDefaultSource()

	if (tree.kind === 'dir' && isValidDirectoryHandle(tree.handle)) {
		primeFsCache(source, tree.handle)
	}
}
