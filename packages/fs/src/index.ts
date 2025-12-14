export {
	getRootDirectory,
	DirectoryPickerUnavailableError,
	getMemoryRoot,
	MemoryDirectoryHandle,
	MemoryFileHandle,
} from './getRoot'
export { createFs, createStorage, VDir, VFile } from './vfs'
export {
	createWorkerStorage,
	createWorkerStorageNoCache,
	createStorageNoCache,
	createSyncStore,
} from './vfs'
export { buildFsTree, walkDirectory } from './vfs/utils/tree'
export type {
	FsContext,
	FsContextOptions,
	OpenMode,
	VfsReadableStream,
	TreeKind,
	FsTreeBase,
	FsFileTreeNode,
	FsDirTreeNode,
	FsTreeNode,
	FsTreeOptions,
	VfsStorage,
	CreateVfsStorageOptions,
	VfsStorageSource,
} from './vfs'
export type { MemHandle } from './getRoot'
export {
	FileSystemObserverPolyfill,
	createFileSystemObserver,
	hasNativeObserver,
} from './FileSystemObserver'
export type {
	FileSystemChangeType,
	FileSystemChangeRecord,
	FileSystemObserverCallback,
	FileSystemObserverOptions,
} from './FileSystemObserver'
