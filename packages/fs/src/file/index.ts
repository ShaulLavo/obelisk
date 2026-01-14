export { HandleCache } from './HandleCache'
export { FileHandle, type SyncAccessHandle, type SyncCapableFileHandle } from './FileHandle'
export { DirHandle } from './DirHandle'
export { RootCtxImpl, createRootCtx } from './RootCtx'
export { createStorage, type Storage, type CreateStorageOptions, type StorageSource } from './storage'
export { createStorageNoCache } from './storageNoCache'
export { buildFsTree, walkDirectory, type WalkDirectoryOptions, type WalkDirectoryResult } from './utils/tree'
export { createWorkerStorage, createSyncStore, type WorkerStorage } from './utils/workerStorage'
export { createWorkerStorageNoCache } from './utils/workerStorageNoCache'
export type {
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
} from './types'
