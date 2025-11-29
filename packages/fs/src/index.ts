export { getRootDirectory } from './getRoot'
export {
	createFs,
	createVfs,
	VDir,
	VFile
} from './vfs'
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
	FsTreeOptions
} from './vfs'
