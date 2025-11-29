import type { VDir } from './index'
import type { VFile } from './index'

export type OpenMode = 'r' | 'rw' | 'rw-unsafe'

export interface FsContextOptions {
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

export interface FsFileTreeNode extends FsTreeBase {
	kind: 'file'
	size?: number
	lastModified?: number
	mimeType?: string
	handle?: FileSystemFileHandle
}

export interface FsDirTreeNode extends FsTreeBase {
	kind: 'dir'
	children: FsTreeNode[]
	handle?: FileSystemDirectoryHandle
}

export type FsTreeNode = FsFileTreeNode | FsDirTreeNode

export interface FsTreeOptions {
	maxDepth?: number
	includeFiles?: boolean
	signal?: AbortSignal
	filter?(node: FsTreeNode): boolean | Promise<boolean>
	withHandles?: boolean
	withFileMeta?: boolean
}

export type VfsReadableStream = ReadableStream<
	BufferSource | Uint8Array<ArrayBufferLike>
>

export interface FsContext {
	readonly root: FileSystemDirectoryHandle
	file(path: string, mode?: OpenMode): VFile
	dir(path?: string): VDir
	// Low-level helpers primarily used by tree building utilities
	getDirectoryHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle>
	getFileHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemFileHandle>
	write(
		target: string | VFile,
		content: string | BufferSource | VfsReadableStream | VFile,
		opts?: { overwrite?: boolean }
	): Promise<void>
	tmpfile(options?: { prefix?: string; suffix?: string }): Promise<VFile>
	exists(path: string): Promise<boolean>
	remove(
		path: string,
		opts?: {
			recursive?: boolean
			force?: boolean
		}
	): Promise<void>
	ensureDir(path: string): Promise<VDir>
	ensurePermission(mode: 'read' | 'readwrite'): Promise<PermissionState>
	queryPermission(mode: 'read' | 'readwrite'): Promise<PermissionState>
	fromTreeNode(node: FsTreeNode): VFile | VDir
}
