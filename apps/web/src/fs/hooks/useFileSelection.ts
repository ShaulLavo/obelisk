import { batch } from 'solid-js'
import { createPieceTableSnapshot } from '@repo/utils'
import type { PieceTableSnapshot } from '@repo/utils'
import { trackOperation } from '@repo/perf'
import { DEFAULT_SOURCE } from '../config/constants'
import type { FsState } from '../types'
import type { FsContextValue, SelectPathOptions } from '../context/FsContext'
import { loadFile } from '../services/FileLoadingService'
import { toast } from '@repo/ui/toaster'
import { createFilePath } from '@repo/fs'
import type { FileCacheController } from '../cache'

type UseFileSelectionOptions = {
	state: FsState
	setSelectedPath: (path: string | undefined) => void
	setPieceTable: (path: string, snapshot: PieceTableSnapshot | null) => void
	setDirty: (path: string, isDirty: boolean) => void
	setSavedContent: (path: string, content: string) => void
	updateDirtyFromPieceTable: (path: string, pieceTable: PieceTableSnapshot | undefined) => void
	fileCache: FileCacheController
}

export const useFileSelection = ({
	state,
	setSelectedPath,
	setPieceTable,
	setDirty,
	setSavedContent,
	updateDirtyFromPieceTable,
	fileCache,
}: UseFileSelectionOptions) => {
	let selectRequestId = 0

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
			setSelectedPath(undefined)
			return
		}

		const node = state.pathIndex[createFilePath(path)]

		if (node?.kind === 'dir') {
			setSelectedPath(path)
			return
		}

		const requestId = ++selectRequestId
		const source = state.activeSource ?? DEFAULT_SOURCE
		const perfMetadata: Record<string, unknown> = { path, source }

		try {
			await trackOperation(
				'fs:selectPath',
				async () => {
					const result = await loadFile({
						source,
						path,
						fileCache,
						forceReload: options?.forceReload,
					})

					perfMetadata.fileSize = result.fileSize

					if (requestId !== selectRequestId) return

					setSelectedPath(path)

					if (!result.fromCache) {
						setSavedContent(path, result.content)
					}
				},
				{
					metadata: perfMetadata,
				}
			)
		} catch (error) {
			if (requestId === selectRequestId) {
				handleReadError(error)
			}
		}
	}

	const updatePieceTableForPath: FsContextValue[1]['updatePieceTableForPath'] =
		(path, updater) => {
			if (!path) return

			const normalizedPath = createFilePath(path)
			const current = state.files[normalizedPath]?.pieceTable ?? undefined
			const next = updater(current)
			if (!next) return

			updateDirtyFromPieceTable(path, next)
		}

	const setPieceTableContent: FsContextValue[1]['setPieceTableContent'] = (
		path,
		content
	) => {
		if (!path) return
		const pieceTable = createPieceTableSnapshot(content)
		batch(() => {
			setPieceTable(path, pieceTable)
			setSavedContent(path, content)
			setDirty(path, false)
		})
	}

	return {
		selectPath,
		updatePieceTableForPath,
		setPieceTableContent,
	}
}
