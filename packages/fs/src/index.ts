export {
	getRootDirectory,
	DirectoryPickerUnavailableError,
	getMemoryRoot,
	MemoryDirectoryHandle,
	MemoryFileHandle,
	pickNewLocalRoot,
} from './getRoot'

// FilePath branded type for normalized paths
export {
	type FilePath,
	createFilePath,
	filePathEquals,
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

// Unified observer with explicit capabilities
export {
	UnifiedObserver,
	createUnifiedObserver,
} from './observer'
export type {
	ObserverCapabilities,
	UnifiedChangeRecord,
	UnifiedObserverCallback,
	UnifiedObserverOptions,
} from './observer'

export { grep, grepStream, GrepCoordinator } from './grep'
export type {
	GrepOptions,
	GrepMatch,
	GrepFileResult,
	GrepProgress,
	GrepProgressCallback,
} from './grep'

export {
	ByteContentHandle,
	ByteContentHandleFactory,
	WriteTokenManager,
	FileSyncManager,
	FileStateTracker,
} from './sync'
export type {
	SyncState,
	ContentHandle,
	ContentHandleFactory,
	WriteToken,
	WriteTokenManagerOptions,
	TrackOptions,
	SyncEventType,
	SyncEvent,
	ExternalChangeEvent,
	ConflictEvent,
	ReloadedEvent,
	DeletedEvent,
	LocalChangesDiscardedEvent,
	SyncedEvent,
	SyncEventMap,
	SyncEventHandler,
	FileSyncManagerOptions,
	ObserverStrategy,
} from './sync'
