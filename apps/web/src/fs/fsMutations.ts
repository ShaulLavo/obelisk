import { batch, type Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import type { FsDirTreeNode, FsFileTreeNode } from '@repo/fs'
import { ensureFs, resolveSourceForPath } from './runtime/fsRuntime'
import type { FsSource, FsState } from './types'
import { logger } from '../logger'
import { addNodeToTree, removeNodeFromTree } from './utils/treeMutations'
import { findNode } from './runtime/tree'

import {
	createPieceTableSnapshot,
	getPieceTableText,
	PieceTableSnapshot,
} from '@repo/utils'
import { toast } from '@repo/ui/toaster'

type FsMutationDeps = {
	getState: () => FsState
	getActiveSource: () => FsSource
	setTree: SetStoreFunction<FsDirTreeNode>
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
	setTree,
	setExpanded,
	setSelectedPath,
	setSelectedFileSize,
	setSelectedFileContent,
	updateSelectedFilePieceTable,
	setSaving,
	setDirtyPath,
	getState,
}: FsMutationDeps) => {
	const createDir = async (parentPath: string, name: string) => {
		const trimmed = name.trim()
		if (!trimmed) return

		const state = getState()
		const tree = state.tree
		if (!tree) return

		const newPath = buildPath(parentPath, trimmed)

		// Check if node already exists
		if (findNode(tree, newPath)) {
			toast.error(`A folder named "${trimmed}" already exists`)
			return
		}

		try {
			const ctx = await ensureFs(getActiveSource())
			await ctx.ensureDir(newPath)

			// Calculate depth based on parent
			const parentNode = findNode(tree, parentPath)
			const parentDepth = parentNode?.depth ?? 0

			// Create the new directory node
			const newNode: FsDirTreeNode = {
				kind: 'dir',
				name: trimmed,
				path: newPath,
				depth: parentDepth + 1,
				parentPath: parentPath || undefined,
				children: [],
				isLoaded: true,
			}

			batch(() => {
				setTree(addNodeToTree(parentPath, newNode))
				setExpanded(parentPath, true)
				setSelectedPath(newPath)
			})
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

		const state = getState()
		const tree = state.tree
		if (!tree) return

		const newPath = buildPath(parentPath, trimmed)

		// Check if node already exists
		if (findNode(tree, newPath)) {
			toast.error(`A file named "${trimmed}" already exists`)
			return
		}

		try {
			const ctx = await ensureFs(getActiveSource())
			const fileContent = content ?? '// empty file'
			await ctx.write(newPath, fileContent)

			// Calculate depth based on parent
			const parentNode = findNode(tree, parentPath)
			const parentDepth = parentNode?.depth ?? 0

			// Create the new file node
			const newNode: FsFileTreeNode = {
				kind: 'file',
				name: trimmed,
				path: newPath,
				depth: parentDepth + 1,
				parentPath: parentPath || undefined,
				size: new Blob([fileContent]).size,
			}

			batch(() => {
				setTree(addNodeToTree(parentPath, newNode))
				setExpanded(parentPath, true)
				setSelectedPath(newPath)
				setSelectedFileSize(new Blob([fileContent]).size)
			})
		} catch (error) {
			logger.withTag('fsMutations').error('Create file failed', { error })
			toast.error(
				error instanceof Error ? error.message : 'Failed to create file'
			)
		}
	}

	const deleteNode = async (path: string) => {
		if (path === '') return

		const state = getState()
		const tree = state.tree
		if (!tree) return

		try {
			const ctx = await ensureFs(getActiveSource())
			await ctx.remove(path, { recursive: true, force: true })

			batch(() => {
				setTree(removeNodeFromTree(path))

				if (
					state.selectedPath === path ||
					state.selectedPath?.startsWith(`${path}/`)
				) {
					setSelectedPath(undefined)
					setSelectedFileSize(undefined)
				}
			})
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

			// Route .system paths to OPFS
			const source = resolveSourceForPath(getActiveSource(), filePath)
			const ctx = await ensureFs(source)
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

			// Sync settings if this is the user settings file
			const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath
			if (normalizedPath === '.system/userSettings.json') {
				try {
					const parsed = JSON.parse(content)
					// Dispatch custom event for settings store to pick up
					window.dispatchEvent(
						new CustomEvent('settings-file-saved', { detail: parsed })
					)
				} catch (e) {
					logger
						.withTag('fsMutations')
						.warn('Settings file saved but JSON parse failed', { error: e })
				}
			}

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
