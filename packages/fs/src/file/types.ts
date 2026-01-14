import type { DirHandle } from './DirHandle'
import type { FileHandle } from './FileHandle'

export type OpenMode = 'r' | 'rw' | 'rw-unsafe'

export interface RootCtxOptions {
	basePath?: string
	normalizePaths?: boolean
}

export type TreeKind = 'file' | 'dir'

export interface FsTreeBase {
	kind: TreeKind
	name: string
	path: string
	depth: number
	parentPath?: string
}

export interface FileTreeNode extends FsTreeBase {
	kind: 'file'
	size?: number
	lastModified?: number
	mimeType?: string
	handle?: FileSystemFileHandle
}

export interface DirTreeNode extends FsTreeBase {
	kind: 'dir'
	children: TreeNode[]
	handle?: FileSystemDirectoryHandle
	isLoaded?: boolean
}

export type TreeNode = FileTreeNode | DirTreeNode

export interface TreeOptions {
	maxDepth?: number
	includeFiles?: boolean
	signal?: AbortSignal
	filter?(node: TreeNode): boolean | Promise<boolean>
	withHandles?: boolean
	withFileMeta?: boolean
	shouldDescend?(node: DirTreeNode): boolean | Promise<boolean>
}

export type ReadableByteStream = ReadableStream<
	BufferSource | Uint8Array<ArrayBufferLike>
>

export interface RootCtx {
	readonly root: FileSystemDirectoryHandle
	file(path: string, mode?: OpenMode): FileHandle
	dir(path?: string): DirHandle
	readTextFiles(paths: string[]): Promise<Map<string, string>>
	getDirectoryHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle>
	getFileHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemFileHandle>
	write(
		target: string | FileHandle,
		content: string | BufferSource | ReadableByteStream | FileHandle,
		opts?: { overwrite?: boolean }
	): Promise<void>
	tmpfile(options?: { prefix?: string; suffix?: string }): Promise<FileHandle>
	exists(path: string): Promise<boolean>
	remove(
		path: string,
		opts?: {
			recursive?: boolean
			force?: boolean
		}
	): Promise<void>
	ensureDir(path: string): Promise<DirHandle>
	ensurePermission(mode: 'read' | 'readwrite'): Promise<PermissionState>
	queryPermission(mode: 'read' | 'readwrite'): Promise<PermissionState>
	fromTreeNode(node: TreeNode): FileHandle | DirHandle
	invalidateCacheForPath(path: string): void
	clearCache(): void
}

export type ResolvedPath = {
	relative: string
	relativeSegments: string[]
	absolute: string
	absoluteSegments: string[]
}

export interface RootCtxInternal extends RootCtx {
	resolveRelative(path: string): ResolvedPath
	ensureParentDirectories(relativePath: string): Promise<void>
	pathExistsAsFile(relativePath: string): Promise<boolean>
	pathExistsAsDirectory(relativePath: string): Promise<boolean>
}
