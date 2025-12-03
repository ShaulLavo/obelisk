import type { FsContext } from './types'

export type ResolvedPath = {
	relative: string
	relativeSegments: string[]
	absolute: string
	absoluteSegments: string[]
}

export interface FsContextInternal extends FsContext {
	resolveRelative(path: string): ResolvedPath
	getDirectoryHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle>
	getFileHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemFileHandle>
	ensureParentDirectories(relativePath: string): Promise<void>
	pathExistsAsFile(relativePath: string): Promise<boolean>
	pathExistsAsDirectory(relativePath: string): Promise<boolean>
}
