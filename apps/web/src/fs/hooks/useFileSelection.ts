import { batch } from 'solid-js'
import {
	createMinimalBinaryParseResult,
	detectBinaryFromPreview,
	parseFileBuffer,
	createPieceTableSnapshot,
	getPieceTableText,
} from '@repo/utils'
import type { PieceTableSnapshot, ParseResult } from '@repo/utils'
import { trackOperation } from '@repo/perf'
import {
	getFileSize,
	readFilePreviewBytes,
	readFileBuffer,
} from '../runtime/streaming'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsState } from '../types'
import type { FsContextValue, SelectPathOptions } from '../context/FsContext'
import { findNode } from '../runtime/tree'
import type { FileCacheController } from '../cache/fileCacheController'
import { parseBufferWithTreeSitter } from '../../treeSitter/workerClient'
import { viewTransitionBatched } from '@repo/utils/viewTransition'
import { toast } from '@repo/ui/toaster'
import { useSettings } from '~/settings/SettingsProvider'
import { createFilePath } from '@repo/fs'

const textDecoder = new TextDecoder()

export const enum FileSelectionAnimation {
	Blur = 'blur',
	None = 'none',
}

type UseFileSelectionOptions = {
	state: FsState
	setSelectedPath: (path: string | undefined) => void
	setSelectedFileSize: (size: number | undefined) => void
	setSelectedFilePreviewBytes: (bytes: Uint8Array | undefined) => void
	setSelectedFileContent: (content: string) => void
	setSelectedFileLoading: (value: boolean) => void
	setDirtyPath: (path: string, isDirty: boolean) => void
	fileCache: FileCacheController
}

const MAX_FILE_SIZE_BYTES = Infinity

export const useFileSelection = ({
	state,
	setSelectedPath,
	setSelectedFileSize,
	setSelectedFilePreviewBytes,
	setSelectedFileContent,
	setSelectedFileLoading,
	setDirtyPath,
	fileCache,
}: UseFileSelectionOptions) => {
	const [settingsState] = useSettings()
	let selectRequestId = 0
	const getSelectionAnimation = (): FileSelectionAnimation => {
		const selectionAnimationValue =
			settingsState.values['ui.fileSelection.animation']
		const selectionAnimationDefault =
			settingsState.defaults['ui.fileSelection.animation']
		const resolvedSelectionAnimation = (selectionAnimationValue ??
			selectionAnimationDefault) as string | undefined

		if (resolvedSelectionAnimation === FileSelectionAnimation.None) {
			return FileSelectionAnimation.None
		}

		return FileSelectionAnimation.Blur
	}

	const handleReadError = (error: unknown) => {
		if (error instanceof DOMException && error.name === 'AbortError') return
		const message =
			error instanceof Error ? error.message : 'Failed to read file'
		toast.error(message)
	}

	const selectPath = async (path: string, options?: SelectPathOptions) => {
		const tree = state.tree
		if (!tree) {
			return
		}

		if (!path) {
			batch(() => {
				setSelectedPath(undefined)
				setSelectedFileSize(undefined)
				setSelectedFilePreviewBytes(undefined)
				setSelectedFileContent('')
				setSelectedFileLoading(false)
			})
			return
		}

		if (options?.forceReload) {
			fileCache.clearContent(path)
		}

		const node = findNode(tree, path)

		// If node is found and it's a directory, handle directory selection
		if (node?.kind === 'dir') {
			batch(() => {
				setSelectedPath(path)
				setSelectedFileSize(undefined)
				setSelectedFileLoading(false)
			})
			return
		}

		// Note: .system paths are automatically routed to OPFS by the streaming layer
		// so settings.json is just a regular file that happens to live in OPFS

		// For files (whether found in tree or not), proceed with file loading
		// This allows opening files from search results even if their parent directory
		// isn't expanded in the tree yet

		const requestId = ++selectRequestId
		// Evict previous file's piece table if it doesn't have unsaved edits
		const previousPath = state.lastKnownFilePath
		if (
			previousPath &&
			previousPath !== path &&
			!state.dirtyPaths[createFilePath(previousPath)]
		) {
			fileCache.clearBuffer(previousPath)
		}
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
					if (requestId !== selectRequestId) {
						return
					}

					let selectedFileContentValue = ''
					let pieceTableSnapshot: PieceTableSnapshot | undefined
					let fileStatsResult: ParseResult | undefined

					let binaryPreviewBytes: Uint8Array | undefined

					if (fileSize > MAX_FILE_SIZE_BYTES) {
						// Skip processing for large files
					} else {
						const previewBytes = await timeAsync('read-preview-bytes', () =>
							readFilePreviewBytes(source, path)
						)
						if (requestId !== selectRequestId) return

						const cachedEntry = await timeAsync('hydrate-cache', () =>
							fileCache.getAsync(path)
						)
						if (requestId !== selectRequestId) return

						const { pieceTable: existingSnapshot, stats: existingFileStats } =
							cachedEntry
						const detection = detectBinaryFromPreview(path, previewBytes)
						const isBinary = !detection.isText

						if (existingSnapshot) {
							selectedFileContentValue = getPieceTableText(existingSnapshot)
							fileStatsResult =
								existingFileStats ??
								timeSync('parse-file-buffer', () =>
									parseFileBuffer(selectedFileContentValue, {
										path,
										textHeuristic: detection,
									})
								)
							pieceTableSnapshot = existingSnapshot
						} else if (isBinary) {
							// Binary files: load both binary preview AND text content
							// Text content is needed for editor mode (broken UTF-8 display like VS Code)
							binaryPreviewBytes = previewBytes

							// Also load full content as UTF-8 text for editor mode
							const buffer = await timeAsync('read-file-buffer', () =>
								readFileBuffer(source, path)
							)
							if (requestId !== selectRequestId) return

							const textBytes = new Uint8Array(buffer)
							const text = textDecoder.decode(textBytes)
							selectedFileContentValue = text

							fileStatsResult =
								existingFileStats ??
								timeSync('binary-file-metadata', () =>
									createMinimalBinaryParseResult(text, detection)
								)
						} else {
							const buffer = await timeAsync('read-file-buffer', () =>
								readFileBuffer(source, path)
							)
							if (requestId !== selectRequestId) return

							const textBytes = new Uint8Array(buffer)
							const text = textDecoder.decode(textBytes)
							selectedFileContentValue = text

							const parseResultPromise = parseBufferWithTreeSitter(path, buffer)
							if (parseResultPromise) {
								void parseResultPromise
									.then((result) => {
										if (requestId !== selectRequestId) return
										if (result) {
											fileCache.set(path, {
												highlights: result.captures,
												folds: result.folds,
												brackets: result.brackets,
												errors: result.errors,
											})
										}
									})
									.catch(() => {
										// Tree-sitter parse failed
									})
							}

							fileStatsResult = timeSync('parse-file-buffer', () =>
								parseFileBuffer(text, {
									path,
									textHeuristic: detection,
								})
							)

							if (fileStatsResult.contentKind === 'text') {
								pieceTableSnapshot = timeSync('create-piece-table', () =>
									createPieceTableSnapshot(text)
								)
							}
						}
					}
					timeSync('apply-selection-state', ({ timeSync }) => {
						const updateState = () => {
							timeSync('set-selected-path', () => setSelectedPath(path))
							timeSync('set-selected-file-size', () =>
								setSelectedFileSize(fileSize)
							)
							timeSync('set-selected-file-preview-bytes', () =>
								setSelectedFilePreviewBytes(binaryPreviewBytes)
							)
							timeSync('set-selected-file-content', () =>
								setSelectedFileContent(selectedFileContentValue)
							)
							if (pieceTableSnapshot || fileStatsResult || binaryPreviewBytes) {
								timeSync('set-cache-entry', () =>
									fileCache.set(path, {
										pieceTable: pieceTableSnapshot,
										stats: fileStatsResult,
										previewBytes: binaryPreviewBytes,
									})
								)
							}
						}

						const selectionAnimation = getSelectionAnimation()
						if (selectionAnimation !== FileSelectionAnimation.Blur) {
							batch(updateState)
							return
						}

						viewTransitionBatched(updateState)
					})
				},
				{
					metadata: perfMetadata,
				}
			)
		} catch (error) {
			if (requestId === selectRequestId) {
				handleReadError(error)
			}
		} finally {
			if (requestId === selectRequestId) {
				setSelectedFileLoading(false)
			}
		}
	}

	const updateSelectedFilePieceTable: FsContextValue[1]['updateSelectedFilePieceTable'] =
		(updater) => {
			const path = state.lastKnownFilePath
			if (!path) {
				return
			}

			const current = state.selectedFilePieceTable
			const next = updater(current)
			if (!next) return

			fileCache.set(path, { pieceTable: next })
			// Mark the file as dirty so its piece table won't be cleared when switching files
			setDirtyPath(path, true)
		}

	const updateSelectedFileHighlights: FsContextValue[1]['updateSelectedFileHighlights'] =
		(highlights) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { highlights })
		}

	const updateSelectedFileFolds: FsContextValue[1]['updateSelectedFileFolds'] =
		(folds) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { folds })
		}

	const updateSelectedFileBrackets: FsContextValue[1]['updateSelectedFileBrackets'] =
		(brackets) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { brackets })
		}

	const updateSelectedFileErrors: FsContextValue[1]['updateSelectedFileErrors'] =
		(errors) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { errors })
		}

	const updateSelectedFileScrollPosition: FsContextValue[1]['updateSelectedFileScrollPosition'] =
		(scrollPosition) => {
			console.log('[useFileSelection] updateSelectedFileScrollPosition:', scrollPosition)
			const path = state.lastKnownFilePath
			if (!path) {
				console.log('[useFileSelection] no path, skipping')
				return
			}
			console.log('[useFileSelection] calling fileCache.set for path:', path)
			fileCache.set(path, { scrollPosition })
		}

	const updateSelectedFileVisibleContent: FsContextValue[1]['updateSelectedFileVisibleContent'] =
		(visibleContent) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { visibleContent })
		}

	const updateSelectedFileCursorPosition: FsContextValue[1]['updateSelectedFileCursorPosition'] =
		(cursorPosition) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { cursorPosition })
		}

	const updateSelectedFileSelections: FsContextValue[1]['updateSelectedFileSelections'] =
		(selections) => {
			const path = state.lastKnownFilePath
			if (!path) return
			fileCache.set(path, { selections })
		}

	return {
		selectPath,
		updateSelectedFilePieceTable,
		updateSelectedFileHighlights,
		updateSelectedFileFolds,
		updateSelectedFileBrackets,
		updateSelectedFileErrors,
		updateSelectedFileScrollPosition,
		updateSelectedFileVisibleContent,
		updateSelectedFileCursorPosition,
		updateSelectedFileSelections,
	}
}
