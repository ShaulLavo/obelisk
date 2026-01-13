import { batch, type Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import type { FsDirTreeNode, FsFileTreeNode, FsTreeNode } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { ensureFs, resolveSourceForPath } from './runtime/fsRuntime'
import type { FsSource, FsState } from './types'
import {
	createPieceTableSnapshot,
	getPieceTableText,
	PieceTableSnapshot,
} from '@repo/utils'
import { toast } from '@repo/ui/toaster'

type FsMutationDeps = {
	getState: () => FsState
	getActiveSource: () => FsSource
	addTreeNode: (parentPath: string, node: FsTreeNode) => void
	removeTreeNode: (path: string) => void
	getNode: (path: string) => FsTreeNode | undefined
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: (value: string | undefined) => void
	setSelectedFileSize: Setter<number | undefined>
	setPieceTable: (path: string, snapshot?: PieceTableSnapshot) => void
	setSaving: Setter<boolean>
	setDirtyPath: (path: string, isDirty: boolean) => void
	setSavedContent: (path: string, content: string) => void
}

const buildPath = (parentPath: string, name: string) =>
	parentPath ? `${parentPath}/${name}` : name

export const createFsMutations = ({
	getActiveSource,
	addTreeNode,
	removeTreeNode,
	getNode,
	setExpanded,
	setSelectedPath,
	setSelectedFileSize,
	setPieceTable,
	setSaving,
	setDirtyPath,
	setSavedContent,
	getState,
}: FsMutationDeps) => {
	const createDir = async (parentPath: string, name: string) => {
		const trimmed = name.trim()
		if (!trimmed) return

		const state = getState()
		if (!state.tree) return

		const newPath = buildPath(parentPath, trimmed)

		if (getNode(newPath)) {
			toast.error(`A folder named "${trimmed}" already exists`)
			return
		}

		try {
			const ctx = await ensureFs(getActiveSource())
			await ctx.ensureDir(newPath)

			const parentNode = getNode(parentPath)
			const parentDepth = parentNode?.depth ?? 0

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
				addTreeNode(parentPath, newNode)
				setExpanded(parentPath, true)
				setSelectedPath(newPath)
			})
		} catch (error) {
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
		if (!state.tree) return

		const newPath = buildPath(parentPath, trimmed)

		if (getNode(newPath)) {
			toast.error(`A file named "${trimmed}" already exists`)
			return
		}

		try {
			const ctx = await ensureFs(getActiveSource())
			const fileContent = content ?? ''
			await ctx.write(newPath, fileContent)

			const parentNode = getNode(parentPath)
			const parentDepth = parentNode?.depth ?? 0

			const newNode: FsFileTreeNode = {
				kind: 'file',
				name: trimmed,
				path: newPath,
				depth: parentDepth + 1,
				parentPath: parentPath || undefined,
				size: new Blob([fileContent]).size,
			}

			batch(() => {
				addTreeNode(parentPath, newNode)
				setExpanded(parentPath, true)
				setSelectedPath(newPath)
				setSelectedFileSize(new Blob([fileContent]).size)
			})
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to create file'
			)
		}
	}

	const deleteNode = async (path: string) => {
		if (path === '') return

		const state = getState()
		if (!state.tree) return

		try {
			const ctx = await ensureFs(getActiveSource())
			await ctx.remove(path, { recursive: true, force: true })

			batch(() => {
				removeTreeNode(path)

				if (
					state.selectedPath === path ||
					state.selectedPath?.startsWith(`${path}/`)
				) {
					setSelectedPath(undefined)
					setSelectedFileSize(undefined)
				}
			})
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete entry'
			)
		}
	}

	const saveFile = async (path: string) => {
		const state = getState()
		const filePath = path
		if (!filePath) return

		const normalizedPath = createFilePath(filePath)

		const stats = state.fileStats[normalizedPath]
		if (stats && stats.contentKind === 'binary') {
			toast.error('Cannot save binary files')
			return
		}

		const pieceTable = state.pieceTables[normalizedPath]
		if (!pieceTable) {
			toast.error('No content to save')
			return
		}

		setSaving(true)

		try {
			const content = getPieceTableText(pieceTable)

			const source = resolveSourceForPath(getActiveSource(), filePath)
			const ctx = await ensureFs(source)
			await ctx.write(filePath, content)

			const newSnapshot = createPieceTableSnapshot(content)

			batch(() => {
				setPieceTable(filePath, newSnapshot)

				if (filePath === state.selectedPath) {
					setSelectedFileSize(new Blob([content]).size)
				}

				setSavedContent(filePath, content)
				setDirtyPath(filePath, false)
			})

			if (normalizedPath === '.system/userSettings.json') {
				try {
					const parsed = JSON.parse(content)
					window.dispatchEvent(
						new CustomEvent('settings-file-saved', { detail: parsed })
					)
				} catch {
				}
			}

			toast.success('File saved')
		} catch {
			toast.error('Failed to save file')
		} finally {
			setSaving(false)
		}
	}

	return { createDir, createFile, deleteNode, saveFile }
}
