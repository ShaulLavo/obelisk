import { batch } from 'solid-js'
import { getPieceTableText, createPieceTableSnapshot } from '@repo/utils'
import type { PieceTableSnapshot } from '@repo/utils'
import { trackOperation } from '@repo/perf'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsState } from '../types'
import type { FsContextValue, SelectPathOptions } from '../context/FsContext'
import type { FileCacheController } from '../cache/fileCacheController'
import { loadFile } from '../services/FileLoadingService'
import { viewTransitionBatched } from '@repo/utils/viewTransition'
import { toast } from '@repo/ui/toaster'
import { useSettings } from '~/settings/SettingsProvider'
import { createFilePath } from '@repo/fs'

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
	setSavedContent: (path: string, content: string) => void
	updateDirtyFromPieceTable: (path: string, pieceTable: PieceTableSnapshot | undefined) => void
	fileCache: FileCacheController
}

export const useFileSelection = ({
	state,
	setSelectedPath,
	setSelectedFileSize,
	setSelectedFilePreviewBytes,
	setSelectedFileContent,
	setSelectedFileLoading,
	setDirtyPath,
	setSavedContent,
	updateDirtyFromPieceTable,
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

		const node = state.pathIndex[createFilePath(path)]

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
				async ({ timeSync }) => {
					// Use FileLoadingService - single source of truth for file loading
					const result = await loadFile({
						source,
						path,
						fileCache,
						forceReload: options?.forceReload,
						onSyntaxReady: (syntax) => {
							// Check race condition before applying syntax
							if (requestId !== selectRequestId) return
							fileCache.getFileState(path).mutateSyntax(syntax)
						},
					})

					perfMetadata.fileSize = result.fileSize

					// Race condition check after file load
					if (requestId !== selectRequestId) return

					// Apply state updates
					timeSync('apply-selection-state', ({ timeSync }) => {
						const updateState = () => {
							timeSync('set-selected-path', () => setSelectedPath(path))
							timeSync('set-selected-file-size', () =>
								setSelectedFileSize(result.fileSize)
							)
							timeSync('set-selected-file-preview-bytes', () =>
								setSelectedFilePreviewBytes(
									result.isBinary ? result.previewBytes ?? undefined : undefined
								)
							)
							timeSync('set-selected-file-content', () =>
								setSelectedFileContent(result.content)
							)

							// Set saved content baseline for dirty tracking (only for fresh loads)
							if (!result.fromCache) {
								setSavedContent(path, result.content)
							}

							if (result.pieceTable || result.stats || result.previewBytes) {
								timeSync('set-cache-entry', () =>
									fileCache.set(path, {
										pieceTable: result.pieceTable ?? undefined,
										stats: result.stats ?? undefined,
										previewBytes: result.isBinary
											? result.previewBytes ?? undefined
											: undefined,
									})
								)
								timeSync('populate-reactive-file-state', () =>
									fileCache.getFileState(path).mutateContent({
										content: result.content,
										pieceTable: result.pieceTable,
										stats: result.stats,
										previewBytes: result.previewBytes,
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

	const updatePieceTableForPath: FsContextValue[1]['updatePieceTableForPath'] =
		(path, updater) => {
			if (!path) return

			const normalizedPath = createFilePath(path)
			const current = state.pieceTables[normalizedPath]
			const next = updater(current)
			if (!next) return

			fileCache.set(path, { pieceTable: next })
			updateDirtyFromPieceTable(path, next)
		}

	const updateHighlightsForPath: FsContextValue[1]['updateHighlightsForPath'] =
		(path, highlights) => {
			if (!path) return
			fileCache.set(path, { highlights })
		}

	const updateFoldsForPath: FsContextValue[1]['updateFoldsForPath'] =
		(path, folds) => {
			if (!path) return
			fileCache.set(path, { folds })
		}

	const updateBracketsForPath: FsContextValue[1]['updateBracketsForPath'] =
		(path, brackets) => {
			if (!path) return
			fileCache.set(path, { brackets })
		}

	const updateErrorsForPath: FsContextValue[1]['updateErrorsForPath'] =
		(path, errors) => {
			if (!path) return
			fileCache.set(path, { errors })
		}

	const setPieceTableContent: FsContextValue[1]['setPieceTableContent'] =
		(path, content) => {
			if (!path) return
			const pieceTable = createPieceTableSnapshot(content)
			batch(() => {
				fileCache.set(path, { pieceTable })
				// Update saved content baseline so file shows as clean after reload
				setSavedContent(path, content)
				// Mark as not dirty since we just set content to match saved
				setDirtyPath(path, false)
			})
		}

	return {
		selectPath,
		updatePieceTableForPath,
		updateHighlightsForPath,
		updateFoldsForPath,
		updateBracketsForPath,
		updateErrorsForPath,
		setPieceTableContent,
	}
}
