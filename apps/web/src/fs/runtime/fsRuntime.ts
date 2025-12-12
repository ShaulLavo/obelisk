import {
	buildFsTree,
	createFs,
	FsDirTreeNode,
	getRootDirectory,
	DirectoryPickerUnavailableError,
	type FsContext as VfsContext
} from '@repo/fs'
import { loggers } from '@repo/logger'
import { trackOperation } from '@repo/perf'
import { toast } from '@repo/ui/toaster'
import { OPFS_ROOT_NAME } from '../config/constants'
import type { FsSource } from '../types'
import { requestLocalDirectoryFallback } from '../fallback/localDirectoryFallbackCoordinator'

const fsCache: Partial<Record<FsSource, VfsContext>> = {}
const initPromises: Partial<Record<FsSource, Promise<void>>> = {}

export class LocalDirectoryFallbackSwitchError extends Error {
	constructor(readonly nextSource: FsSource) {
		super(`Switch to ${nextSource}`)
		this.name = 'LocalDirectoryFallbackSwitchError'
	}
}

export const fileHandleCache = new Map<string, FileSystemFileHandle>()

let awaitingPermissionToastId: string | number | null = null

const showAwaitingPermissionToast = () => {
	if (awaitingPermissionToastId !== null) return
	awaitingPermissionToastId = toast('Waiting for permission', {
		description: 'Click or press a key to continue the directory picker.',
		duration: Infinity
	})
}

const clearAwaitingPermissionToast = () => {
	if (awaitingPermissionToastId === null) return
	toast.dismiss(awaitingPermissionToastId)
	awaitingPermissionToastId = null
}

export function invalidateFs(source: FsSource) {
	delete fsCache[source]
	delete initPromises[source]
}

export async function ensureFs(source: FsSource): Promise<VfsContext> {
	if (fsCache[source]) return fsCache[source]!

	if (!initPromises[source]) {
		initPromises[source] = trackOperation(
			'fs:ensureFs:init',
			async ({ timeAsync, timeSync }) => {
				const rootHandle = await timeAsync('get-root', async () => {
					try {
						return await getRootDirectory(source, OPFS_ROOT_NAME, {
							onAwaitingInteraction: showAwaitingPermissionToast
						})
					} catch (error) {
						if (
							source === 'local' &&
							error instanceof DirectoryPickerUnavailableError
						) {
							const fallback =
								await requestLocalDirectoryFallback('unsupported')
							if (fallback.nextSource && fallback.nextSource !== source) {
								primeFsCache(fallback.nextSource, fallback.handle)
								throw new LocalDirectoryFallbackSwitchError(fallback.nextSource)
							}
							return fallback.handle
						}
						throw error
					}
				}).finally(() => {
					clearAwaitingPermissionToast()
				})
				fsCache[source] = timeSync('create-fs', () => createFs(rootHandle))
			},
			{ metadata: { source }, logger: loggers.fs }
		).catch(error => {
			delete initPromises[source]
			delete fsCache[source]
			throw error
		})
	}

	await initPromises[source]
	return fsCache[source]!
}

export function primeFsCache(
	source: FsSource,
	rootHandle: FileSystemDirectoryHandle
) {
	fsCache[source] = createFs(rootHandle)
	initPromises[source] = Promise.resolve()
}

type BuildTreeOptions = {
	rootPath?: string
	rootName?: string
	expandedPaths?: Record<string, boolean>
	ensurePaths?: readonly string[]
	operationName?: string
}

const collectAncestorPaths = (paths: readonly string[] | undefined) => {
	const ancestors = new Set<string>()
	if (!paths) return ancestors

	for (const raw of paths) {
		if (!raw) continue
		const segments = raw.split('/').filter(Boolean)
		let current = ''
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment
			ancestors.add(current)
		}
	}

	return ancestors
}

const createShouldDescend = (
	expandedPaths?: Record<string, boolean>,
	ensurePaths?: readonly string[]
) => {
	const hasExpansionControls = Boolean(expandedPaths)
	const ancestors = collectAncestorPaths(ensurePaths)
	const hasAncestors = ancestors.size > 0

	if (!hasExpansionControls && !hasAncestors) {
		return undefined
	}

	return (node: FsDirTreeNode) => {
		if (node.depth === 0) return true
		if (expandedPaths?.[node.path]) return true
		return ancestors.has(node.path)
	}
}

const deriveRootName = (rootPath: string | undefined) => {
	if (!rootPath) return OPFS_ROOT_NAME
	const segments = rootPath.split('/').filter(Boolean)
	return segments[segments.length - 1] ?? OPFS_ROOT_NAME
}

export async function buildTree(
	source: FsSource,
	options?: BuildTreeOptions
): Promise<FsDirTreeNode> {
	const rootPath = options?.rootPath ?? ''
	const rootName = options?.rootName ?? deriveRootName(rootPath)
	const operationName = options?.operationName ?? 'fs:buildTree'
	const shouldDescend = createShouldDescend(
		options?.expandedPaths,
		options?.ensurePaths
	)

	return trackOperation(
		operationName,
		async ({ timeAsync }) => {
			const ctx = await timeAsync('ensure-fs', () => ensureFs(source))
			const root = await timeAsync('build-fs-tree', () =>
				buildFsTree(ctx, { path: rootPath, name: rootName }, { shouldDescend })
			)

			return root
		},
		{ metadata: { source, rootPath }, logger: loggers.fs }
	)
}

export type { BuildTreeOptions }

export {
	createFileTextStream,
	getFileSize,
	readFilePreviewBytes,
	readFileText,
	safeReadFileText,
	streamFileText
} from './streaming'
