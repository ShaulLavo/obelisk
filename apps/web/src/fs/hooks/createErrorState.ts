import { createStore, reconcile } from 'solid-js/store'
import type { TreeSitterError } from '../../workers/treeSitter/types'

export const createErrorState = () => {
	const [fileErrors, setErrorsStore] = createStore<
		Record<string, TreeSitterError[] | undefined>
	>({})

	const setErrors = (path: string, errors?: TreeSitterError[]) => {
		if (!path) return
		if (!errors?.length) {
			setErrorsStore(path, undefined)
			return
		}

		setErrorsStore(path, errors)
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
