import {
	buildFsTree,
	createRootCtx,
	DirTreeNode,
	getRootDirectory,
	DirectoryPickerUnavailableError,
	type RootCtx,
} from '@repo/fs'
import { trackOperation } from '@repo/perf'
import { modal } from '@repo/ui/modal'
import { OPFS_ROOT_NAME } from '../config/constants'
import type { FsSource } from '../types'
import { requestLocalDirectoryFallback } from '../fallback/localDirectoryFallbackCoordinator'

const fsCache: Partial<Record<FsSource, RootCtx>> = {}
const initPromises: Partial<Record<FsSource, Promise<void>>> = {}

export class LocalDirectoryFallbackSwitchError extends Error {
	constructor(readonly nextSource: FsSource) {
		super(`Switch to ${nextSource}`)
		this.name = 'LocalDirectoryFallbackSwitchError'
	}
}

export const fileHandleCache = new Map<string, FileSystemFileHandle>()

let awaitingPermissionModalId: string | null = null

const showAwaitingPermissionModal = () => {
	if (awaitingPermissionModalId !== null) return
	awaitingPermissionModalId = modal({
		heading: 'Waiting for permission',
		body: 'Click or press a key to continue the directory picker.',
		dismissable: false,
	})
}

const clearAwaitingPermissionModal = () => {
	if (awaitingPermissionModalId === null) return
	modal.dismiss(awaitingPermissionModalId)
	awaitingPermissionModalId = null
}

export function invalidateFs(source: FsSource) {
	delete fsCache[source]
	delete initPromises[source]
}

export async function ensureFs(source: FsSource): Promise<RootCtx> {
	if (fsCache[source]) return fsCache[source]!

	if (!initPromises[source]) {
		initPromises[source] = trackOperation(
			'fs:ensureFs:init',
			async ({ timeAsync, timeSync }) => {
				const rootHandle = await timeAsync('get-root', async () => {
					try {
						return await getRootDirectory(source, OPFS_ROOT_NAME, {
							onAwaitingInteraction: showAwaitingPermissionModal,
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
					clearAwaitingPermissionModal()
				})
				fsCache[source] = timeSync('create-fs', () => createRootCtx(rootHandle))
			},
			{ metadata: { source } }
		).catch((error) => {
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
	fsCache[source] = createRootCtx(rootHandle)
	initPromises[source] = Promise.resolve()
}

export function getRootHandle(
	source: FsSource
): FileSystemDirectoryHandle | undefined {
	return fsCache[source]?.root
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

	return (node: DirTreeNode) => {
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
): Promise<DirTreeNode> {
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
		{ metadata: { source, rootPath } }
	)
}

export type { BuildTreeOptions }

export {
	createFileTextStream,
	getFileSize,
	readFilePreviewBytes,
	readFileText,
	resolveSourceForPath,
	safeReadFileText,
	streamFileText,
} from './streaming'
