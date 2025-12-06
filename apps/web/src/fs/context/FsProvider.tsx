import type { FsDirTreeNode } from '@repo/fs'
import { batch, createEffect, type JSX, onCleanup, onMount } from 'solid-js'
import {
	createMinimalBinaryParseResult,
	detectBinaryFromPreview,
	parseFileBuffer,
	createPieceTableSnapshot
} from '@repo/utils'
import { trackOperation } from '@repo/perf'
import { DEFAULT_SOURCE } from '../config/constants'
import { createFsMutations } from '../fsMutations'
import { buildTree, ensureFs } from '../runtime/fsRuntime'
import {
	getFileSize,
	readFilePreviewBytes,
	readFileText
} from '../runtime/streaming'
import { restoreHandleCache } from '../runtime/handleCache'
import { findNode } from '../runtime/tree'
import { createFsState } from '../state/fsState'
import type { FsSource } from '../types'
import { createTreePrefetchClient } from '../prefetch/treePrefetchClient'
import {
	FsContext,
	type FsContextValue,
	type SelectPathOptions
} from './FsContext'

export function FsProvider(props: { children: JSX.Element }) {
	const {
		state,
		hydration,
		setTree,
		setExpanded,
		setSelectedPath,
		setActiveSource,
		setSelectedFileSize,
		setSelectedFilePreviewBytes,
		setSelectedFileContent,
		setSelectedFileLoading,
		setError,
		setLoading,
		setFileStats,
		clearParseResults,
		setPieceTable,
		clearPieceTables,
		setBackgroundPrefetching,
		setBackgroundLoadedCount,
		setLastPrefetchedPath,
		setPrefetchError
	} = createFsState()

	const subtreeLoads = new Map<string, Promise<void>>()
	const supportsWorkers =
		typeof window !== 'undefined' && typeof Worker !== 'undefined'
	const treePrefetchClient = supportsWorkers
		? createTreePrefetchClient()
		: undefined
	const prefetchQueue = new Set<string>()
	const loadedDirPaths = new Set<string>()
	let prefetchProcessing = false
	let workerInitialized = false
	let prefetchSessionId = 0

	const resetPrefetchTracking = () => {
		prefetchQueue.clear()
		setBackgroundPrefetching(false)
		setLastPrefetchedPath(undefined)
		setPrefetchError(undefined)
	}

	const seedLoadedDirSnapshot = (root?: FsDirTreeNode) => {
		loadedDirPaths.clear()
		if (!root) {
			setBackgroundLoadedCount(0)
			return
		}

		const stack: FsDirTreeNode[] = [root]
		while (stack.length) {
			const dir = stack.pop()!
			if (dir.isLoaded !== false) {
				const key = dir.path ?? ''
				loadedDirPaths.add(key)
			}
			for (const child of dir.children) {
				if (child.kind === 'dir') {
					stack.push(child)
				}
			}
		}
		setBackgroundLoadedCount(loadedDirPaths.size)
	}

	const absorbLoadedDirs = (node: FsDirTreeNode) => {
		const stack: FsDirTreeNode[] = [node]
		let dirty = false
		while (stack.length) {
			const dir = stack.pop()!
			if (dir.isLoaded !== false) {
				const key = dir.path ?? ''
				if (!loadedDirPaths.has(key)) {
					loadedDirPaths.add(key)
					dirty = true
				}
			}
			for (const child of dir.children) {
				if (child.kind === 'dir') {
					stack.push(child)
				}
			}
		}

		if (dirty) {
			setBackgroundLoadedCount(loadedDirPaths.size)
		}
	}

	const removePrefetchTarget = (path: string | undefined) => {
		if (!path) return
		prefetchQueue.delete(path)
	}

	const collectUnloadedDirs = (root?: FsDirTreeNode) => {
		if (!root) return []
		const pending = new Set<string>()
		const stack: FsDirTreeNode[] = [root]

		while (stack.length) {
			const current = stack.pop()!
			if (current.kind !== 'dir') continue

			if (current.path && current.isLoaded === false) {
				pending.add(current.path)
			}

			for (const child of current.children) {
				if (child.kind === 'dir') {
					stack.push(child)
				}
			}
		}

		return Array.from(pending)
	}

	const queuePrefetchTargets = (paths: readonly string[]) => {
		if (!treePrefetchClient) return
		let added = false
		for (const path of paths) {
			if (!path) continue
			if (loadedDirPaths.has(path)) continue
			if (prefetchQueue.has(path)) continue
			prefetchQueue.add(path)
			added = true
		}

		if (added) {
			kickPrefetchLoop()
		}
	}

	const kickPrefetchLoop = () => {
		if (prefetchProcessing) return
		if (!workerInitialized) return
		if (!treePrefetchClient) return
		if (prefetchQueue.size === 0) return
		void processPrefetchQueue(prefetchSessionId)
	}

	const processPrefetchQueue = async (session: number) => {
		if (!treePrefetchClient) return
		if (prefetchProcessing) return
		if (!workerInitialized) return
		if (prefetchQueue.size === 0) return
		if (session !== prefetchSessionId) return

		prefetchProcessing = true
		setBackgroundPrefetching(true)

		try {
			while (session === prefetchSessionId && prefetchQueue.size > 0) {
				const iterator = prefetchQueue.values().next()
				if (iterator.done) break
				const path = iterator.value as string
				prefetchQueue.delete(path)
				try {
					const prefetched = await treePrefetchClient.loadDirectory(path)
					if (session !== prefetchSessionId) break
					if (!prefetched) continue
					const latestTree = state.tree
					if (!latestTree) continue
					const latestDir = findNode(latestTree, path)
					if (!latestDir || latestDir.kind !== 'dir') continue
					const normalized = normalizeDirNodeMetadata(
						prefetched,
						latestDir.parentPath,
						latestDir.depth
					)
					setDirNode(path, normalized)
					absorbLoadedDirs(normalized)
					setLastPrefetchedPath(path)
					setPrefetchError(undefined)
					const nestedTargets = collectUnloadedDirs(normalized)
					queuePrefetchTargets(nestedTargets)
				} catch (error) {
					setPrefetchError(
						error instanceof Error
							? error.message
							: 'Failed to prefetch directory'
					)
				}
			}
		} finally {
			prefetchProcessing = false
			if (session === prefetchSessionId && prefetchQueue.size === 0) {
				setBackgroundPrefetching(false)
			}
			if (session === prefetchSessionId && prefetchQueue.size > 0) {
				kickPrefetchLoop()
			}
		}
	}

	const startBackgroundPrefetch = async (
		tree: FsDirTreeNode,
		source: FsSource
	) => {
		prefetchSessionId += 1
		if (!treePrefetchClient) {
			resetPrefetchTracking()
			return
		}
		workerInitialized = false
		resetPrefetchTracking()
		try {
			const ctx = await ensureFs(source)
			await treePrefetchClient.init({
				source,
				rootHandle: ctx.root,
				rootPath: tree.path ?? '',
				rootName: tree.name || 'root'
			})
			workerInitialized = true
			const pending = collectUnloadedDirs(tree)
			queuePrefetchTargets(pending)
		} catch (error) {
			workerInitialized = false
			setPrefetchError(
				error instanceof Error
					? error.message
					: 'Failed to start background prefetch'
			)
		}
	}

	const buildEnsurePaths = () => {
		const paths = new Set<string>()
		const selectedNode = state.selectedNode
		if (selectedNode?.kind === 'file') {
			paths.add(selectedNode.path)
		}
		const lastFilePath = state.lastKnownFilePath
		if (lastFilePath) {
			paths.add(lastFilePath)
		}
		return Array.from(paths)
	}

	const normalizeDirNodeMetadata = (
		node: FsDirTreeNode,
		parentPath: string | undefined,
		depth: number
	): FsDirTreeNode => {
		const childParentPath = node.path || undefined
		return {
			...node,
			parentPath,
			depth,
			children: node.children.map(child => {
				if (child.kind === 'dir') {
					return normalizeDirNodeMetadata(child, childParentPath, depth + 1)
				}

				return {
					...child,
					parentPath: childParentPath,
					depth: depth + 1
				}
			})
		}
	}

	const replaceDirNodeInTree = (
		current: FsDirTreeNode,
		targetPath: string,
		replacement: FsDirTreeNode
	): FsDirTreeNode => {
		if (current.path === targetPath) {
			return replacement
		}

		let changed = false
		const children = current.children.map(child => {
			if (child.kind !== 'dir') return child
			const shouldDescend =
				child.path === targetPath || targetPath.startsWith(`${child.path}/`)
			if (!shouldDescend) return child
			const next = replaceDirNodeInTree(child, targetPath, replacement)
			if (next !== child) {
				changed = true
			}
			return next
		})

		if (!changed) {
			return current
		}

		return {
			...current,
			children
		}
	}

	const setDirNode = (path: string, node: FsDirTreeNode) => {
		if (!state.tree) return
		if (!path) {
			setTree(() => node)
			return
		}
		const nextTree = replaceDirNodeInTree(state.tree, path, node)
		if (nextTree === state.tree) return
		setTree(() => nextTree)
	}

	const ensureDirLoaded = (path: string) => {
		if (!state.tree) return
		const existing = findNode(state.tree, path)
		if (!existing || existing.kind !== 'dir') return
		if (existing.isLoaded !== false) return
		const inflight = subtreeLoads.get(path)
		if (inflight) return inflight

		removePrefetchTarget(path)
		const expandedSnapshot = { ...state.expanded, [path]: true }
		const ensurePaths = buildEnsurePaths()
		const load = (async () => {
			try {
				const subtree = await buildTree(state.activeSource ?? DEFAULT_SOURCE, {
					rootPath: path,
					expandedPaths: expandedSnapshot,
					ensurePaths,
					operationName: 'fs:buildSubtree'
				})
				const latest = state.tree ? findNode(state.tree, path) : undefined
				if (!latest || latest.kind !== 'dir') return
					const normalized = normalizeDirNodeMetadata(
						subtree,
						latest.parentPath,
						latest.depth
					)
					setDirNode(path, normalized)
					absorbLoadedDirs(normalized)
					queuePrefetchTargets(collectUnloadedDirs(normalized))
				} catch (error) {
				setError(
					error instanceof Error
						? error.message
						: 'Failed to load directory contents'
				)
			} finally {
				subtreeLoads.delete(path)
			}
		})()

		subtreeLoads.set(path, load)
		return load
	}

	let selectRequestId = 0
	const MAX_FILE_SIZE_BYTES = Infinity

	const getRestorableFilePath = (tree: FsDirTreeNode) => {
		const candidates = [state.selectedPath, state.lastKnownFilePath].filter(
			(path): path is string => typeof path === 'string'
		)

		for (const candidate of candidates) {
			const node = findNode(tree, candidate)
			if (node?.kind === 'file') {
				return node.path
			}
		}

		return undefined
	}

	const refresh = async (
		source: FsSource = state.activeSource ?? DEFAULT_SOURCE
	) => {
		setLoading(true)
		clearParseResults()
		clearPieceTables()
		const ensurePaths = buildEnsurePaths()

			try {
				const built = await buildTree(source, {
					expandedPaths: state.expanded,
					ensurePaths
				})
			const restorablePath = getRestorableFilePath(built)

				batch(() => {
					setTree(built)
					setActiveSource(source)
					setExpanded(expanded => ({
						...expanded,
						[built.path]: expanded[built.path] ?? true
					}))
					setError(undefined)
				})
				seedLoadedDirSnapshot(built)

				void startBackgroundPrefetch(built, source)

			for (const [expandedPath, isOpen] of Object.entries(state.expanded)) {
				if (isOpen) {
					void ensureDirLoaded(expandedPath)
				}
			}

			if (restorablePath) {
				await selectPath(restorablePath, { forceReload: true })
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Failed to load filesystem'
			)
			resetPrefetchTracking()
		} finally {
			setLoading(false)
		}
	}

	const toggleDir = (path: string) => {
		const next = !state.expanded[path]
		batch(() => {
			setExpanded(path, next)
			setSelectedPath(path)
		})
		if (next) {
			void ensureDirLoaded(path)
		}
	}

	const handleReadError = (error: unknown) => {
		if (error instanceof DOMException && error.name === 'AbortError') return

		setError(error instanceof Error ? error.message : 'Failed to read file')
	}

	const selectPath = async (path: string, options?: SelectPathOptions) => {
		const tree = state.tree
		if (!tree) return
		if (state.selectedPath === path && !options?.forceReload) return

		const node = findNode(tree, path)
		if (!node) return

		if (node.kind === 'dir') {
			setSelectedPath(path)
			setSelectedFileSize(undefined)
			setSelectedFileLoading(false)
			return
		}

		const requestId = ++selectRequestId
		setSelectedFileLoading(true)
		const source = state.activeSource ?? DEFAULT_SOURCE
		const perfMetadata: Record<string, unknown> = { path, source }

		try {
			await trackOperation(
				'fs:selectPath',
				async ({ timeSync, timeAsync }) => {
					const fileSize = await timeAsync('get-file-size', () =>
						getFileSize(source, path)
					)
					perfMetadata.fileSize = fileSize
					if (requestId !== selectRequestId) return

					let selectedFileContentValue = ''
					let pieceTableSnapshot:
						| ReturnType<typeof createPieceTableSnapshot>
						| undefined
					let fileStatsResult:
						| ReturnType<typeof parseFileBuffer>
						| ReturnType<typeof createMinimalBinaryParseResult>
						| undefined

					let binaryPreviewBytes: Uint8Array | undefined

					if (fileSize > MAX_FILE_SIZE_BYTES) {
						// Skip processing for large files
					} else {
						const previewBytes = await timeAsync('read-preview-bytes', () =>
							readFilePreviewBytes(source, path)
						)
						if (requestId !== selectRequestId) return

						const detection = detectBinaryFromPreview(path, previewBytes)
						const isBinary = !detection.isText

						if (isBinary) {
							binaryPreviewBytes = previewBytes
							fileStatsResult = timeSync('binary-file-metadata', () =>
								createMinimalBinaryParseResult('', detection)
							)
						} else {
							const text = await timeAsync('read-file-text', () =>
								readFileText(source, path)
							)
							if (requestId !== selectRequestId) return

							selectedFileContentValue = text

							fileStatsResult = timeSync('parse-file-buffer', () =>
								parseFileBuffer(text, {
									path,
									textHeuristic: detection
								})
							)

							if (fileStatsResult.contentKind === 'text') {
								const existingSnapshot = (
									state.pieceTables as Record<
										string,
										ReturnType<typeof createPieceTableSnapshot> | undefined
									>
								)[path]

								pieceTableSnapshot =
									existingSnapshot ??
									timeSync('create-piece-table', () =>
										createPieceTableSnapshot(text)
									)
							}
						}
					}

					timeSync('apply-selection-state', ({ timeSync }) => {
						batch(() => {
							timeSync('set-selected-path', () => setSelectedPath(path))
							timeSync('clear-error', () => setError(undefined))
							timeSync('set-selected-file-size', () =>
								setSelectedFileSize(fileSize)
							)
							timeSync('set-selected-file-preview-bytes', () =>
								setSelectedFilePreviewBytes(binaryPreviewBytes)
							)
							timeSync('set-selected-file-content', () =>
								setSelectedFileContent(selectedFileContentValue)
							)
							if (pieceTableSnapshot) {
								timeSync('set-piece-table', () =>
									setPieceTable(path, pieceTableSnapshot)
								)
							}
							if (fileStatsResult) {
								timeSync('set-file-stats', () =>
									setFileStats(path, fileStatsResult)
								)
							}
						})
					})
				},
				{
					metadata: perfMetadata
				}
			).catch(error => {
				if (requestId !== selectRequestId) return
				handleReadError(error)
			})
		} finally {
			if (requestId === selectRequestId) {
				setSelectedFileLoading(false)
			}
		}
	}

	const { createDir, createFile, deleteNode } = createFsMutations({
		refresh,
		setExpanded,
		setSelectedPath,
		setSelectedFileSize,
		setError,
		getState: () => state,
		getActiveSource: () => state.activeSource
	})

	const setSource = (source: FsSource) => refresh(source)

	const updateSelectedFilePieceTable: FsContextValue[1]['updateSelectedFilePieceTable'] =
		updater => {
			const path = state.lastKnownFilePath
			if (!path) return

			const current = state.selectedFilePieceTable
			const next = updater(current)
			if (!next) return

			setPieceTable(path, next)
		}

	onMount(() => {
		void hydration.then(() => {
			restoreHandleCache({
				tree: state.tree,
				activeSource: state.activeSource
			})
			return refresh(state.activeSource ?? DEFAULT_SOURCE)
		})
	})
	// sync file content onMount
	// TODO there is a way better way 100% to do this
	createEffect(() => {
		const node = state.selectedNode
		if (node?.kind === 'file')
			localStorage.setItem('fs-last-known-file-path', node.path)
	})
	onMount(() => {
		const lastFilePath =
			localStorage.getItem('fs-last-known-file-path') ?? undefined
		setSelectedPath(lastFilePath)
	})

	onCleanup(() => {
		resetPrefetchTracking()
		workerInitialized = false
		prefetchProcessing = false
		void treePrefetchClient?.dispose()
	})

	const value: FsContextValue = [
		state,
		{
			refresh,
			setSource,
			toggleDir,
			selectPath,
			createDir,
			createFile,
			deleteNode,
			updateSelectedFilePieceTable
		}
	]

	return <FsContext.Provider value={value}>{props.children}</FsContext.Provider>
}
