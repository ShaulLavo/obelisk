export {
	getRootDirectory,
	DirectoryPickerUnavailableError,
	getMemoryRoot,
	MemoryDirectoryHandle,
	MemoryFileHandle,
	pickNewLocalRoot,
} from './getRoot'
export type { MemHandle } from './getRoot'

export {
	type FilePath,
	createFilePath,
	filePathEquals,
	filePathToString,
	toPosix,
	toDisplayPath,
	getParentPath,
	getBaseName,
	getExtension,
	joinPath,
	isChildOf,
	isRootPath,
	isFilePath,
	unsafeAsFilePath,
} from './types'

export {
	HandleCache,
	FileHandle,
	DirHandle,
	RootCtxImpl,
	createRootCtx,
	createStorage,
	createStorageNoCache,
	buildFsTree,
	walkDirectory,
	createWorkerStorage,
	createSyncStore,
	createWorkerStorageNoCache,
} from './file'
export type {
	SyncAccessHandle,
	SyncCapableFileHandle,
	OpenMode,
	RootCtxOptions,
	TreeKind,
	FsTreeBase,
	FileTreeNode,
	DirTreeNode,
	TreeNode,
	TreeOptions,
	ReadableByteStream,
	RootCtx,
	ResolvedPath,
	RootCtxInternal,
	Storage,
	CreateStorageOptions,
	StorageSource,
	WorkerStorage,
	WalkDirectoryOptions,
	WalkDirectoryResult,
} from './file'

export { SyncController } from './sync/SyncController'
export type { SyncControllerOptions } from './sync/SyncController'
export type {
	ConflictSource,
	ExternalFileChangeEvent,
	FileDeletedEvent,
	FileConflictEvent,
	SyncEvent,
	SyncEventType,
	SyncEventMap,
	SyncEventHandler,
} from './sync/sync-types'

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

export { grep, grepStream, GrepCoordinator } from './grep'
export type {
	GrepOptions,
	GrepMatch,
	GrepFileResult,
	GrepProgress,
	GrepProgressCallback,
} from './grep'

export { ByteContentHandle, ByteContentHandleFactory } from './sync'
export type {
	SyncState,
	ContentHandle,
	ContentHandleFactory,
} from './sync'
