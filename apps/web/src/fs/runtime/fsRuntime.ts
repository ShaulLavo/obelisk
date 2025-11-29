import {
	buildFsTree,
	createFs,
	getRootDirectory,
	type FsContext as VfsContext,
	type FsTreeNode,
	FsDirTreeNode
} from '@repo/fs'
import type { FsSource } from '../types'
import { OPFS_ROOT_NAME } from '../config/constants'
import { collectFileHandles } from './fileHandles'

const fsCache: Partial<Record<FsSource, VfsContext>> = {}
const initPromises: Partial<Record<FsSource, Promise<void>>> = {}

export const fileHandleCache = new Map<string, FileSystemFileHandle>()

export function invalidateFs(source: FsSource) {
	delete fsCache[source]
	delete initPromises[source]
}

export async function ensureFs(source: FsSource): Promise<VfsContext> {
	if (fsCache[source]) return fsCache[source]!

	if (!initPromises[source]) {
		initPromises[source] = (async () => {
			const rootHandle = await getRootDirectory(source, OPFS_ROOT_NAME)
			fsCache[source] = createFs(rootHandle)
		})()
	}

	await initPromises[source]
	return fsCache[source]!
}

export function primeFsCache(
	source: FsSource,
	rootHandle: FileSystemDirectoryHandle
) {
	fsCache[source] = createFs(rootHandle)
	initPromises[source] = Promise.resolve()
}

export async function buildTree(source: FsSource): Promise<FsDirTreeNode> {
	const ctx = await ensureFs(source)
	const root = await buildFsTree(
		ctx,
		{ path: '', name: OPFS_ROOT_NAME },
		{ withHandles: true }
	)

	fileHandleCache.clear()
	collectFileHandles(root)

	return root
}

export {
	streamFileText,
	readFileText,
	safeReadFileText,
	createFileTextStream
} from './streaming'
