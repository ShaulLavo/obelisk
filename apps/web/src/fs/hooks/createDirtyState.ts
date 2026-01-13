/* eslint-disable solid/reactivity */
import { createStore } from 'solid-js/store'
import { createFilePath, type FilePath } from '@repo/fs'
import type { PieceTableSnapshot } from '@repo/utils'
import { getCachedPieceTableContent } from '@repo/utils'

export const createDirtyState = () => {
	const [dirtyPaths, setDirtyPaths] = createStore<Record<string, boolean>>({})
	const savedContents: Record<FilePath, string> = {}

	const setDirtyPath = (path: string, isDirty?: boolean) => {
		const p = createFilePath(path)
		if (isDirty === undefined || isDirty === false) {
			setDirtyPaths(p, undefined as unknown as boolean)
		} else {
			setDirtyPaths(p, isDirty)
		}
	}

	const setSavedContent = (path: string, content: string) => {
		const p = createFilePath(path)
		savedContents[p] = content
	}

	const getSavedContent = (path: string): string | undefined => {
		const p = createFilePath(path)
		return savedContents[p]
	}

	const clearSavedContent = (path: string) => {
		const p = createFilePath(path)
		delete savedContents[p]
	}

	const updateDirtyFromPieceTable = (path: string, pieceTable: PieceTableSnapshot | undefined) => {
		const p = createFilePath(path)
		const saved = savedContents[p]
		if (saved === undefined) {
			return
		}

		if (!pieceTable) {
			setDirtyPath(p, false)
			return
		}

		const currentContent = getCachedPieceTableContent(pieceTable)
		const isDirty = currentContent !== saved
		setDirtyPath(p, isDirty)
	}

	const clearDirtyPaths = () => {
		setDirtyPaths({})
	}

	return {
		dirtyPaths,
		savedContents,
		setDirtyPath,
		setSavedContent,
		getSavedContent,
		clearSavedContent,
		updateDirtyFromPieceTable,
		clearDirtyPaths,
	}
}
