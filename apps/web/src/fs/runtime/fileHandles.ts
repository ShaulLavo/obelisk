import type { FsContext } from '@repo/fs'
import { fileHandleCache } from './fsRuntime'

export const getCachedFileHandle = (path: string) =>
	fileHandleCache.get(path)

export async function getOrCreateFileHandle(
	ctx: FsContext,
	path: string
): Promise<FileSystemFileHandle> {
	const cached = fileHandleCache.get(path)
	if (cached) return cached

	const handle = await ctx.getFileHandleForRelative(path, false)
	fileHandleCache.set(path, handle)
	return handle
}
