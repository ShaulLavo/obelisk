import type { FsDirTreeNode, FsFileTreeNode, FsTreeNode, FsTreeOptions } from '../types'
import { throwIfAborted } from './abort'
import { iterateDirectoryEntries } from './dir'
import { joinPaths } from './path'

type TreeContextApi = {
	getDirectoryHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle>
	getFileHandleForRelative(
		path: string,
		create: boolean
	): Promise<FileSystemFileHandle>
}

const DEFAULT_MAX_DEPTH = Infinity

export async function buildFsTree(
	ctx: TreeContextApi,
	root: { path: string; name: string },
	options?: FsTreeOptions
): Promise<FsDirTreeNode> {
	const {
		maxDepth = DEFAULT_MAX_DEPTH,
		includeFiles = true,
		withHandles = false,
		withFileMeta = false,
		filter,
		signal
	} = options ?? {}

	const shouldInclude = async (node: FsTreeNode, isRoot: boolean): Promise<boolean> => {
		if (isRoot) return true
		if (!filter) return true
		return Boolean(await filter(node))
	}

	const buildFileNode = async (
		name: string,
		path: string,
		depth: number,
		parentPath: string | undefined,
		handle: FileSystemFileHandle
	): Promise<FsFileTreeNode | undefined> => {
		let size: number | undefined
		let lastModified: number | undefined
		let mimeType: string | undefined

		if (withFileMeta) {
			const file = await handle.getFile()
			size = file.size
			lastModified = file.lastModified
			mimeType = file.type || undefined
		}

		const node: FsFileTreeNode = {
			kind: 'file',
			name,
			path,
			depth,
			parentPath,
			size,
			lastModified,
			mimeType,
			handle: withHandles ? handle : undefined
		}

		if (!(await shouldInclude(node, false))) {
			return undefined
		}

		return node
	}

	const buildDirNode = async (
		path: string,
		name: string,
		handle: FileSystemDirectoryHandle,
		depth: number,
		parentPath: string | undefined,
		isRoot: boolean
	): Promise<FsDirTreeNode | undefined> => {
		throwIfAborted(signal)

		const dirNode: FsDirTreeNode = {
			kind: 'dir',
			name,
			path,
			depth,
			parentPath,
			children: [],
			handle: withHandles ? handle : undefined
		}

		if (!(await shouldInclude(dirNode, isRoot))) {
			return undefined
		}

		if (depth >= maxDepth) {
			return dirNode
		}

		for await (const [entryName, entry] of iterateDirectoryEntries(handle)) {
			throwIfAborted(signal)

			const childPath = joinPaths(path, entryName)
			const childParentPath = path || undefined

			if (entry.kind === 'directory') {
				const childHandle = entry as FileSystemDirectoryHandle
				const childNode = await buildDirNode(
					childPath,
					entryName,
					childHandle,
					depth + 1,
					childParentPath,
					false
				)

				if (!childNode) continue
				dirNode.children.push(childNode)
				continue
			}

			if (!includeFiles) continue

			const fileHandle =
				entry.kind === 'file'
					? (entry as FileSystemFileHandle)
					: await ctx.getFileHandleForRelative(childPath, false)

			const fileNode = await buildFileNode(
				entryName,
				childPath,
				depth + 1,
				childParentPath,
				fileHandle
			)

			if (!fileNode) continue
			dirNode.children.push(fileNode)
		}

		return dirNode
	}

	const rootHandle = await ctx.getDirectoryHandleForRelative(root.path, false)
	const rootNode = await buildDirNode(root.path, root.name, rootHandle, 0, undefined, true)

	return (
		rootNode ?? {
			kind: 'dir',
			name: root.name,
			path: root.path,
			depth: 0,
			children: []
		}
	)
}
