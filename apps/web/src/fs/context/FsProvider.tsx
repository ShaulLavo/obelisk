import type { FsDirTreeNode } from '@repo/fs'
import { batch, createEffect, type JSX, onMount } from 'solid-js'
import {
	createMinimalBinaryParseResult,
	detectBinaryFromPreview,
	parseFileBuffer
} from '~/utils/parse'
import { trackOperation } from '~/perf'
import { createPieceTableSnapshot } from '~/utils/pieceTable'
import { DEFAULT_SOURCE } from '../config/constants'
import { createFsMutations } from '../fsMutations'
import { buildTree } from '../runtime/fsRuntime'
import {
	getFileSize,
	readFilePreviewBytes,
	readFileText
} from '../runtime/streaming'
import { restoreHandleCache } from '../runtime/handleCache'
import { findNode } from '../runtime/tree'
import { createFsState } from '../state/fsState'
import type { FsSource } from '../types'
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
		clearPieceTables
	} = createFsState()

	let selectRequestId = 0
	const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 100 // 100 MB

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

		try {
			const built = await buildTree(source)
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

			if (restorablePath) {
				await selectPath(restorablePath, { forceReload: true })
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Failed to load filesystem'
			)
		} finally {
			setLoading(false)
		}
	}

	const toggleDir = (path: string) => {
		batch(() => {
			setExpanded(path, prev => !prev)
			setSelectedPath(path)
		})
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

				let previewBytes: Uint8Array | undefined

				if (fileSize > MAX_FILE_SIZE_BYTES) {
					// Skip processing for large files
				} else {
					previewBytes = await timeAsync('read-preview-bytes', () =>
						readFilePreviewBytes(source, path)
					)
					if (requestId !== selectRequestId) return

					const detection = detectBinaryFromPreview(path, previewBytes)
					const isBinary = !detection.isText

					if (isBinary) {
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
								previewBytes,
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
							setSelectedFilePreviewBytes(previewBytes)
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
