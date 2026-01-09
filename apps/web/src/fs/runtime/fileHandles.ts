import type { FsContext } from '@repo/fs'
import { fileHandleCache } from './fsRuntime'

export const getCachedFileHandle = (path: string) => fileHandleCache.get(path)

export async function getOrCreateFileHandle(
	ctx: FsContext,
	path: string
): Promise<FileSystemFileHandle> {
	console.log(`[fileHandles] getOrCreateFileHandle called`, { path })
	const cached = fileHandleCache.get(path)
	if (cached) {
		console.log(`[fileHandles] getOrCreateFileHandle: cache HIT`, { path })
		return cached
	}

	console.log(`[fileHandles] getOrCreateFileHandle: cache MISS, resolving handle`, { path })
	const handle = await ctx.getFileHandleForRelative(path, false)
	console.log(`[fileHandles] getOrCreateFileHandle: handle resolved`, { path, handleExists: !!handle })
	fileHandleCache.set(path, handle)
	return handle
}
