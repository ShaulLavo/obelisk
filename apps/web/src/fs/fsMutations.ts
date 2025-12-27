import { batch, type Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import { ensureFs } from './runtime/fsRuntime'
import type { FsSource, FsState } from './types'
import { logger } from '../logger'

import {
	createPieceTableSnapshot,
	getPieceTableText,
	PieceTableSnapshot,
} from '@repo/utils'
import { toast } from '@repo/ui/toaster'

type FsMutationDeps = {
	getState: () => FsState
	getActiveSource: () => FsSource
	refresh: (source?: FsSource) => Promise<void>
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: Setter<string | undefined>
	setSelectedFileSize: Setter<number | undefined>
	setSelectedFileContent: Setter<string>
	updateSelectedFilePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	setSaving: Setter<boolean>
	setDirtyPath: (path: string, isDirty: boolean) => void
}

const buildPath = (parentPath: string, name: string) =>
	parentPath ? `${parentPath}/${name}` : name

export const createFsMutations = ({
	getActiveSource,
	setExpanded,
	setSelectedPath,
	setSelectedFileSize,
	setSelectedFileContent,
	updateSelectedFilePieceTable,
	setSaving,
	setDirtyPath,
	getState,
	refresh,
}: FsMutationDeps) => {
	const createDir = async (parentPath: string, name: string) => {
		const trimmed = name.trim()
		if (!trimmed) return
		try {
			const ctx = await ensureFs(getActiveSource())
			const newPath = buildPath(parentPath, trimmed)
			await ctx.ensureDir(newPath)
			batch(() => {
				setExpanded(parentPath, true)
				setSelectedPath(newPath)
			})
			await refresh()
		} catch (error) {
			logger.withTag('fsMutations').error('Create directory failed', { error })
			toast.error(
				error instanceof Error ? error.message : 'Failed to create directory'
			)
		}
	}

	const createFile = async (
		parentPath: string,
		name: string,
		content?: string
	) => {
		const trimmed = name.trim()
		if (!trimmed) return
		try {
			const ctx = await ensureFs(getActiveSource())
			const newPath = buildPath(parentPath, trimmed)
			const fileContent = content ?? '// empty file'
			await ctx.write(newPath, fileContent)
			batch(() => {
				setExpanded(parentPath, true)
				setSelectedPath(newPath)
				setSelectedFileSize(new Blob([fileContent]).size)
			})
			await refresh()
		} catch (error) {
			logger.withTag('fsMutations').error('Create file failed', { error })
			toast.error(
				error instanceof Error ? error.message : 'Failed to create file'
			)
		}
	}

	const deleteNode = async (path: string) => {
		if (path === '') return
		try {
			const ctx = await ensureFs(getActiveSource())
			await ctx.remove(path, { recursive: true, force: true })
			const state = getState()
			batch(() => {
				if (
					state.selectedPath === path ||
					state.selectedPath?.startsWith(`${path}/`)
				) {
					setSelectedPath(undefined)
					setSelectedFileSize(undefined)
				}
			})
			await refresh()
		} catch (error) {
			logger.withTag('fsMutations').error('Delete entry failed', { error })
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete entry'
			)
		}
	}

	const saveFile = async (path?: string) => {
		const state = getState()
		const filePath = path ?? state.lastKnownFilePath
		if (!filePath) return

		if (path && path !== state.lastKnownFilePath) {
			toast.error('Can only save the currently selected file')
			return
		}

		const stats = state.fileStats[filePath]
		if (stats && stats.contentKind === 'binary') {
			toast.error('Cannot save binary files')
			return
		}

		setSaving(true)

		try {
			const pieceTable = state.pieceTables[filePath]

			const content = pieceTable
				? getPieceTableText(pieceTable)
				: state.selectedFileContent

			const ctx = await ensureFs(getActiveSource())
			await ctx.write(filePath, content)

			const newSnapshot = createPieceTableSnapshot(content)

			batch(() => {
				updateSelectedFilePieceTable(() => newSnapshot)

				if (filePath === state.selectedPath) {
					setSelectedFileSize(new Blob([content]).size)
				}

				setSelectedFileContent(content)

				setDirtyPath(filePath, false)
			})
			toast.success('File saved')
		} catch (error) {
			logger.withTag('fsMutations').error('Save failed', { error })
			toast.error('Failed to save file')
		} finally {
			setSaving(false)
		}
	}

	return { createDir, createFile, deleteNode, saveFile }
}
