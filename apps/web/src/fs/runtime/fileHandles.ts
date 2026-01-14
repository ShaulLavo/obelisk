import type { RootCtx } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { fileHandleCache } from './fsRuntime'

export const getCachedFileHandle = (path: string) =>
	fileHandleCache.get(createFilePath(path))

export async function getOrCreateFileHandle(
	ctx: RootCtx,
	path: string
): Promise<FileSystemFileHandle> {
	const normalizedPath = createFilePath(path)
	const cached = fileHandleCache.get(normalizedPath)
	if (cached) {
		return cached
	}

	const handle = await ctx.getFileHandleForRelative(path, false)

	fileHandleCache.set(normalizedPath, handle)
	return handle
}
