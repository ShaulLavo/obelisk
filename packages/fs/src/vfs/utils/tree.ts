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

export type WalkDirectoryOptions = {
	includeDirs?: boolean
	includeFiles?: boolean
	withMeta?: boolean
	signal?: AbortSignal
}

export type WalkDirectoryResult = {
	path: string
	name: string
	depth: number
	parentPath?: string
	dirs: FsDirTreeNode[]
	files: FsFileTreeNode[]
}

type WalkTarget = {
	path: string
	name?: string
	depth?: number
	parentPath?: string
}

const deriveNameFromPath = (path: string) => {
	const segments = path.split('/').filter(Boolean)
	return segments[segments.length - 1] ?? ''
}

const createShallowDirNode = (
	name: string,
	path: string,
	depth: number,
	parentPath: string | undefined
): FsDirTreeNode => ({
	kind: 'dir',
	name,
	path,
	depth,
	parentPath,
	children: [],
	isLoaded: false
})

const createFileNode = async (
	name: string,
	path: string,
	depth: number,
	parentPath: string | undefined,
	getHandle: () => Promise<FileSystemFileHandle>,
	options: { withHandles: boolean; withMeta: boolean },
	signal?: AbortSignal
): Promise<FsFileTreeNode> => {
	throwIfAborted(signal)

	let handle: FileSystemFileHandle | undefined
	if (options.withHandles || options.withMeta) {
		handle = await getHandle()
	}

	let size: number | undefined
	let lastModified: number | undefined
	let mimeType: string | undefined

	if (options.withMeta) {
		const file = await handle!.getFile()
		size = file.size
		lastModified = file.lastModified
		mimeType = file.type || undefined
	}

	return {
		kind: 'file',
		name,
		path,
		depth,
		parentPath,
		size,
		lastModified,
		mimeType,
		handle: options.withHandles ? handle : undefined
	}
}

/**
 * Shallow directory walker. Prefer this when you only need the immediate children
 * of a path (e.g. background hydration, lazy tree expansion) because it avoids
 * recursive traversal and keeps payloads small. Use `buildFsTree` instead when
 * you need a full subtree with nested descendants.
 */
export async function walkDirectory(
	ctx: TreeContextApi,
	target: WalkTarget,
	options?: WalkDirectoryOptions
): Promise<WalkDirectoryResult> {
	const includeDirs = options?.includeDirs ?? true
	const includeFiles = options?.includeFiles ?? true
	const withMeta = options?.withMeta ?? false
	const signal = options?.signal

	const handle = await ctx.getDirectoryHandleForRelative(target.path, false)
	const dirs: FsDirTreeNode[] = []
	const files: FsFileTreeNode[] = []
	const depth = target.depth ?? 0
	const parentPath = target.parentPath

	for await (const [entryName, entry] of iterateDirectoryEntries(handle)) {
		const childPath = joinPaths(target.path, entryName)
		const childParentPath = target.path || undefined

		if (entry.kind === 'directory') {
			if (!includeDirs) continue
			dirs.push(
				createShallowDirNode(entryName, childPath, depth + 1, childParentPath)
			)
			continue
		}

		if (!includeFiles) continue

		const createHandle =
			entry.kind === 'file'
				? async () => entry as FileSystemFileHandle
				: () => ctx.getFileHandleForRelative(childPath, false)

		const node = await createFileNode(
			entryName,
			childPath,
			depth + 1,
			childParentPath,
			createHandle,
			{ withHandles: false, withMeta },
			signal
		)

		files.push(node)
	}

	dirs.sort((a, b) => a.name.localeCompare(b.name))
	files.sort((a, b) => a.name.localeCompare(b.name))

	return {
		path: target.path,
		name: target.name ?? deriveNameFromPath(target.path),
		depth,
		parentPath,
		dirs,
		files
	}
}

/**
 * Recursive tree builder. Use this when you need an entire subtree rooted at
 * `root` (e.g. initial load, eager expansion). For shallow/background work prefer
 * `walkDirectory` above so you only fetch the immediate children.
 */
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
		signal,
		shouldDescend
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
			handle: withHandles ? handle : undefined,
			isLoaded: true
		}

		if (!(await shouldInclude(dirNode, isRoot))) {
			return undefined
		}

		if (depth >= maxDepth) {
			dirNode.isLoaded = false
			return dirNode
		}

		if (shouldDescend) {
			const canDescend = await shouldDescend(dirNode)
			if (!canDescend) {
				dirNode.isLoaded = false
				return dirNode
			}
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

			dirNode.children = childNodes
				.filter((node): node is FsTreeNode => Boolean(node))
				.sort(compareNodes)
		}

		dirNode.isLoaded = true
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
