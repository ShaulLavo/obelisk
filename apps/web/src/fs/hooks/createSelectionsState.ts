import { createStore, reconcile } from 'solid-js/store'
import type { SelectionRange } from '../store/types'
import { createFilePath } from '@repo/fs'

export const createSelectionsState = () => {
	const [fileSelections, setFileSelectionsStore] = createStore<
		Record<string, SelectionRange[] | undefined>
	>({})

	const setSelections = (path: string, selections?: SelectionRange[]) => {
		if (!path) return
		const p = createFilePath(path)
		if (!selections) {
			setFileSelectionsStore(p, undefined)
			return
		}

		setFileSelectionsStore(p, selections)
	}

	const clearSelections = () => {
		setFileSelectionsStore(reconcile({}))
	}

	return {
		fileSelections,
		setSelections,
		clearSelections,
	}
}
