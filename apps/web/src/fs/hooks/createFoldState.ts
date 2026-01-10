import { createStore, reconcile } from 'solid-js/store'
import type { FoldRange } from '../../workers/treeSitter/types'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createFoldState = () => {
	const [fileFolds, setFoldsStore] = createStore<
		Record<string, FoldRange[] | undefined>
	>({})

	const setFolds = (path: string, folds?: FoldRange[]) => {
		if (!path) return
		const p = normalizePath(path)
		if (!folds?.length) {
			setFoldsStore(p, undefined)
			return
		}

		setFoldsStore(p, folds)
	}

	const clearFolds = () => {
		setFoldsStore(reconcile({}))
	}

	return {
		fileFolds,
		setFolds,
		clearFolds,
	}
}
