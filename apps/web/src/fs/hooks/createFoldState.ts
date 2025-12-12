import { createStore, reconcile } from 'solid-js/store'
import type { FoldRange } from '../../workers/treeSitterWorkerTypes'

export const createFoldState = () => {
	const [fileFolds, setFoldsStore] = createStore<
		Record<string, FoldRange[] | undefined>
	>({})

	const setFolds = (path: string, folds?: FoldRange[]) => {
		if (!path) return
		if (!folds?.length) {
			setFoldsStore(path, undefined)
			return
		}

		setFoldsStore(path, folds)
	}

	const clearFolds = () => {
		setFoldsStore(reconcile({}))
	}

	return {
		fileFolds,
		setFolds,
		clearFolds
	}
}
