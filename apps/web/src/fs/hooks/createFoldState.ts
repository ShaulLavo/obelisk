import { createStore, reconcile } from 'solid-js/store'
import type { FoldRange } from '../../workers/treeSitter/types'
import { createFilePath } from '@repo/fs'

export const createFoldState = () => {
	const [fileFolds, setFoldsStore] = createStore<
		Record<string, FoldRange[] | undefined>
	>({})

	const setFolds = (path: string, folds?: FoldRange[]) => {
		if (!path) return
		const p = createFilePath(path)
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
