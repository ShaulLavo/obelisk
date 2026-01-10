import { createStore, reconcile } from 'solid-js/store'
import type { TreeSitterError } from '../../workers/treeSitter/types'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createErrorState = () => {
	const [fileErrors, setErrorsStore] = createStore<
		Record<string, TreeSitterError[] | undefined>
	>({})

	const setErrors = (path: string, errors?: TreeSitterError[]) => {
		if (!path) return
		const p = normalizePath(path)
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
