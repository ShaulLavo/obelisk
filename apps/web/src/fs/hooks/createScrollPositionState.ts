import { createStore, reconcile } from 'solid-js/store'
import type { ScrollPosition } from '../store/types'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createScrollPositionState = () => {
	const [scrollPositions, setScrollPositionsStore] = createStore<
		Record<string, ScrollPosition | undefined>
	>({})

	const setScrollPosition = (path: string, position?: ScrollPosition) => {
		if (!path) return
		const p = normalizePath(path)
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
