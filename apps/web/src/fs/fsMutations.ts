import { batch, type Setter } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import { ensureFs } from './runtime/fsRuntime'
import type { FsSource, FsState } from './types'

type FsMutationDeps = {
	refresh: (source?: FsSource) => Promise<void>
	setExpanded: SetStoreFunction<Record<string, boolean>>
	setSelectedPath: Setter<string | undefined>
	setSelectedFileContent: Setter<string>
	setError: Setter<string | undefined>
	getState: () => FsState
	getActiveSource: () => FsSource
}

const buildPath = (parentPath: string, name: string) =>
	parentPath ? `${parentPath}/${name}` : name

export const createFsMutations = ({
	getActiveSource,
	setExpanded,
	setSelectedPath,
	setSelectedFileContent,
	setError,
	getState,
	refresh
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
			setError(error instanceof Error ? error.message : 'Failed to create directory')
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
				setSelectedFileContent(fileContent)
			})
			await refresh()
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to create file')
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
					setSelectedFileContent('')
				}
			})
			await refresh()
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to delete entry')
		}
	}

	return { createDir, createFile, deleteNode }
}
