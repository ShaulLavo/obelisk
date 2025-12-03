import type { FsDirTreeNode } from '@repo/fs'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsSource } from '../types'
import { primeFsCache } from './fsRuntime'

const isValidDirectoryHandle = (
	handle: unknown
): handle is FileSystemDirectoryHandle => {
	if (!handle || typeof handle !== 'object') return false
	// Memory handles lose their methods after IndexedDB serialization
	const h = handle as { entries?: unknown; [Symbol.asyncIterator]?: unknown }
	return (
		typeof h.entries === 'function' ||
		typeof h[Symbol.asyncIterator] === 'function'
	)
}

type RestoreHandleCacheParams = {
	tree: FsDirTreeNode | undefined
	activeSource?: FsSource
}

export const restoreHandleCache = ({
	tree,
	activeSource
}: RestoreHandleCacheParams) => {
	if (!tree) return

	const source = activeSource ?? DEFAULT_SOURCE

	if (tree.kind === 'dir' && isValidDirectoryHandle(tree.handle)) {
		primeFsCache(source, tree.handle)
	}
}
