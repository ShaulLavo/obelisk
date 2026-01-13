import { createStore, reconcile } from 'solid-js/store'
import type { ScrollPosition } from '../store/types'
import { createFilePath } from '@repo/fs'

export const createScrollPositionState = () => {
	const [scrollPositions, setScrollPositionsStore] = createStore<
		Record<string, ScrollPosition | undefined>
	>({})

	const setScrollPosition = (path: string, position?: ScrollPosition) => {
		if (!path) return
		const p = createFilePath(path)
		if (!position) {
			setScrollPositionsStore(p, undefined)
			return
		}

		setScrollPositionsStore(p, position)
	}

	const clearScrollPositions = () => {
		setScrollPositionsStore(reconcile({}))
	}

	return {
		scrollPositions,
		setScrollPosition,
		clearScrollPositions,
	}
}
