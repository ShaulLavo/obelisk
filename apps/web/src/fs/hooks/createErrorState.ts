import { createStore, reconcile } from 'solid-js/store'
import type { TreeSitterError } from '../../workers/treeSitter/types'
import { createFilePath } from '@repo/fs'

export const createErrorState = () => {
	const [fileErrors, setErrorsStore] = createStore<
		Record<string, TreeSitterError[] | undefined>
	>({})

	const setErrors = (path: string, errors?: TreeSitterError[]) => {
		if (!path) return
		const p = createFilePath(path)
		if (!errors?.length) {
			setErrorsStore(p, undefined)
			return
		}

		setErrorsStore(p, errors)
	}

	const clearErrors = () => {
		setErrorsStore(reconcile({}))
	}

	return {
		fileErrors,
		setErrors,
		clearErrors,
	}
}
