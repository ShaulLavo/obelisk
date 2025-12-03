import type {
	FsDirTreeNode,
	FsFileTreeNode,
	FsTreeNode,
	FsTreeOptions
} from '../types'
import { logger } from '@repo/logger'
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

const compareNodes = (a: FsTreeNode, b: FsTreeNode) => {
	if (a.kind !== b.kind) {
		return a.kind === 'dir' ? -1 : 1
	}

	return a.name.localeCompare(b.name)
}

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

	const shouldInclude = async (
		node: FsTreeNode,
		isRoot: boolean
	): Promise<boolean> => {
		if (isRoot) return true
		if (!filter) return true
		return Boolean(await filter(node))
	}

	const buildFileNode = async (
		name: string,
		path: string,
		depth: number,
		parentPath: string | undefined,
		getHandle: () => Promise<FileSystemFileHandle>
	): Promise<FsFileTreeNode | undefined> => {
		throwIfAborted(signal)

		let size: number | undefined
		let lastModified: number | undefined
		let mimeType: string | undefined
		let handle: FileSystemFileHandle | undefined

		if (withHandles || withFileMeta) {
			handle = await getHandle()
		}

		if (withFileMeta) {
			if (!handle) {
				logger.warn('File handle is required to fetch file metadata')
				return undefined
			}

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

		type ChildResult = FsTreeNode | undefined
		const childTasks: Array<Promise<ChildResult>> = []

		for await (const [entryName, entry] of iterateDirectoryEntries(handle)) {
			const childPath = joinPaths(path, entryName)
			const childParentPath = path || undefined

			if (entry.kind === 'directory') {
				const childHandle = entry as FileSystemDirectoryHandle

				childTasks.push(
					buildDirNode(
						childPath,
						entryName,
						childHandle,
						depth + 1,
						childParentPath,
						false
					)
				)

				continue
			}

			if (!includeFiles) continue

			const makeFileTask = async () => {
				const resolveHandle =
					entry.kind === 'file'
						? async () => entry as FileSystemFileHandle
						: () => ctx.getFileHandleForRelative(childPath, false)

				return buildFileNode(
					entryName,
					childPath,
					depth + 1,
					childParentPath,
					resolveHandle
				)
			}

			childTasks.push(makeFileTask())
		}

		if (childTasks.length) {
			const childNodes = await Promise.all(childTasks)

			childNodes
				.filter((node): node is FsTreeNode => Boolean(node))
				.sort(compareNodes)
				.forEach(node => {
					dirNode.children.push(node)
				})
		}

		return dirNode
	}

	const rootHandle = await ctx.getDirectoryHandleForRelative(root.path, false)
	const rootNode = await buildDirNode(
		root.path,
		root.name,
		rootHandle,
		0,
		undefined,
		true
	)

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
