import type { FsContext } from '@repo/fs'
import { fileHandleCache } from './fsRuntime'

/**
 * Normalize path by stripping leading slash.
 * This ensures consistent cache keys regardless of path format.
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const getCachedFileHandle = (path: string) => 
	fileHandleCache.get(normalizePath(path))

export async function getOrCreateFileHandle(
	ctx: FsContext,
	path: string
): Promise<FileSystemFileHandle> {
	const normalizedPath = normalizePath(path)
	const cached = fileHandleCache.get(normalizedPath)
	if (cached) {
		return cached
	}

	const handle = await ctx.getFileHandleForRelative(path, false)

	fileHandleCache.set(normalizedPath, handle)
	return handle
}
