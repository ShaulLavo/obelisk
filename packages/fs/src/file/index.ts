export { HandleCache } from './HandleCache'
export { FileHandle, type SyncAccessHandle, type SyncCapableFileHandle } from './FileHandle'
export { DirHandle } from './DirHandle'
export { FileContextImpl, createFileContext } from './FileContext'
export { createStorage, type Storage, type CreateStorageOptions, type StorageSource } from './storage'
export { createStorageNoCache } from './storageNoCache'
export { buildFsTree, walkDirectory, type WalkDirectoryOptions, type WalkDirectoryResult } from './utils/tree'
export { createWorkerStorage, createSyncStore, type WorkerStorage } from './utils/workerStorage'
export { createWorkerStorageNoCache } from './utils/workerStorageNoCache'
export type {
	OpenMode,
	FileContextOptions,
	TreeKind,
	FsTreeBase,
	FileTreeNode,
	DirTreeNode,
	TreeNode,
	TreeOptions,
	ReadableByteStream,
	FileContext,
	ResolvedPath,
	FileContextInternal,
} from './types'
