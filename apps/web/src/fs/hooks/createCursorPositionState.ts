import { createStore, reconcile } from 'solid-js/store'
import type { CursorPosition } from '../store/types'
import { createFilePath } from '@repo/fs'

export const createCursorPositionState = () => {
	const [cursorPositions, setCursorPositionsStore] = createStore<
		Record<string, CursorPosition | undefined>
	>({})

	const setCursorPosition = (path: string, position?: CursorPosition) => {
		if (!path) return
		const p = createFilePath(path)
		if (!position) {
			setCursorPositionsStore(p, undefined)
			return
		}

		setCursorPositionsStore(p, position)
	}

	const clearCursorPositions = () => {
		setCursorPositionsStore(reconcile({}))
	}

	return {
		cursorPositions,
		setCursorPosition,
		clearCursorPositions,
	}
}
