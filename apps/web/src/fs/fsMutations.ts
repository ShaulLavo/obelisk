import { batch, type Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import type { DirTreeNode, FileTreeNode, TreeNode } from '@repo/fs'
import { createFilePath } from '@repo/fs'
import { ensureFs } from './runtime/fsRuntime'
import { resolveSourceForPath } from './runtime/streaming'
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
	addTreeNode: (parentPath: string, node: TreeNode) => void
	removeTreeNode: (path: string) => void
	getNode: (path: string) => TreeNode | undefined
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: (value: string | undefined) => void
	setPieceTable: (path: string, snapshot: PieceTableSnapshot | null) => void
	setSaving: Setter<boolean>
	setDirty: (path: string, isDirty: boolean) => void
	setSavedContent: (path: string, content: string) => void
	/** Optional callback invoked after a file is successfully saved */
	onSave?: (path: string, content: string) => void
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
	setPieceTable,
	setSaving,
	setDirty,
	setSavedContent,
	getState,
	onSave,
}: FsMutationDeps) => {
	/**
	 * Validates and prepares common state for node creation.
	 * Returns null if creation should be aborted (empty name, no tree, or duplicate).
	 */
	const prepareNodeCreation = (
		parentPath: string,
		name: string,
		entityLabel: 'file' | 'folder'
	): { trimmed: string; newPath: string; parentDepth: number } | null => {
		const trimmed = name.trim()
		if (!trimmed) return null

		const state = getState()
		if (!state.tree) return null

		const newPath = buildPath(parentPath, trimmed)

		if (getNode(newPath)) {
			toast.error(`A ${entityLabel} named "${trimmed}" already exists`)
			return null
		}

		const parentNode = getNode(parentPath)
		const parentDepth = parentNode?.depth ?? 0

		return { trimmed, newPath, parentDepth }
	}

	const finalizeNodeCreation = (
		parentPath: string,
		newPath: string,
		node: TreeNode
	) => {
		batch(() => {
			addTreeNode(parentPath, node)
			setExpanded(parentPath, true)
			setSelectedPath(newPath)
		})
	}

	const createDir = async (parentPath: string, name: string) => {
		const prep = prepareNodeCreation(parentPath, name, 'folder')
		if (!prep) return

		const { trimmed, newPath, parentDepth } = prep

		try {
			const ctx = await ensureFs(getActiveSource())
			await ctx.ensureDir(newPath)

			const newNode: DirTreeNode = {
				kind: 'dir',
				name: trimmed,
				path: newPath,
				depth: parentDepth + 1,
				parentPath: parentPath || undefined,
				children: [],
				isLoaded: true,
			}

			finalizeNodeCreation(parentPath, newPath, newNode)
		} catch (error) {
			console.warn('createDir failed:', newPath, error)
			toast.error('Failed to create directory')
		}
	}

	const createFile = async (
		parentPath: string,
		name: string,
		content?: string
	) => {
		const prep = prepareNodeCreation(parentPath, name, 'file')
		if (!prep) return

		const { trimmed, newPath, parentDepth } = prep

		try {
			const ctx = await ensureFs(getActiveSource())
			const fileContent = content ?? ''
			await ctx.write(newPath, fileContent)

			const newNode: FileTreeNode = {
				kind: 'file',
				name: trimmed,
				path: newPath,
				depth: parentDepth + 1,
				parentPath: parentPath || undefined,
				size: new Blob([fileContent]).size,
			}

			finalizeNodeCreation(parentPath, newPath, newNode)
		} catch (error) {
			console.warn('createFile failed:', newPath, error)
			toast.error('Failed to create file')
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
				}
			})
		} catch (error) {
			console.warn('deleteNode failed:', path, error)
			toast.error('Failed to delete entry')
		}
	}

	const saveFile = async (path: string) => {
		if (!path) return

		const state = getState()
		const normalizedPath = createFilePath(path)
		const fileState = state.files[normalizedPath]

		const stats = fileState?.stats
		if (stats && stats.contentKind === 'binary') {
			toast.error('Cannot save binary files')
			return
		}

		const pieceTable = fileState?.pieceTable
		if (!pieceTable) {
			toast.error('No content to save')
			return
		}

		setSaving(true)

		try {
			const content = getPieceTableText(pieceTable)

			const source = resolveSourceForPath(getActiveSource(), path)
			const ctx = await ensureFs(source)
			await ctx.write(path, content)

			const newSnapshot = createPieceTableSnapshot(content)

			batch(() => {
				setPieceTable(path, newSnapshot)
				setSavedContent(path, content)
				setDirty(path, false)
			})

			onSave?.(normalizedPath, content)

			toast.success('File saved')
		} catch (e) {
			console.warn('saveFile failed:', path, e)
			toast.error('Failed to save file')
		} finally {
			setSaving(false)
		}
	}

	return { createDir, createFile, deleteNode, saveFile }
}
