export { getRootDirectory } from './getRoot'
export { createFs, createStore, VDir, VFile } from './vfs'
export { buildFsTree } from './vfs/utils/tree'
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
	VfsStore,
	CreateVfsStoreOptions,
	VfsStoreSource
} from './vfs'
