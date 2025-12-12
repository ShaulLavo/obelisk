import type { FsContext } from '@repo/fs'
export declare const getCachedFileHandle: (
	path: string
) => FileSystemFileHandle | undefined
export declare function getOrCreateFileHandle(
	ctx: FsContext,
	path: string
): Promise<FileSystemFileHandle>
//# sourceMappingURL=fileHandles.d.ts.map
