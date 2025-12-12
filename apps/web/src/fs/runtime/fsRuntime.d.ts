import { FsDirTreeNode, type FsContext as VfsContext } from '@repo/fs'
import type { FsSource } from '../types'
export declare class LocalDirectoryFallbackSwitchError extends Error {
	readonly nextSource: FsSource
	constructor(nextSource: FsSource)
}
export declare const fileHandleCache: Map<string, FileSystemFileHandle>
export declare function invalidateFs(source: FsSource): void
export declare function ensureFs(source: FsSource): Promise<VfsContext>
export declare function primeFsCache(
	source: FsSource,
	rootHandle: FileSystemDirectoryHandle
): void
type BuildTreeOptions = {
	rootPath?: string
	rootName?: string
	expandedPaths?: Record<string, boolean>
	ensurePaths?: readonly string[]
	operationName?: string
}
export declare function buildTree(
	source: FsSource,
	options?: BuildTreeOptions
): Promise<FsDirTreeNode>
export type { BuildTreeOptions }
export {
	createFileTextStream,
	getFileSize,
	readFilePreviewBytes,
	readFileText,
	safeReadFileText,
	streamFileText,
} from './streaming'
//# sourceMappingURL=fsRuntime.d.ts.map
