import { createStore, reconcile } from 'solid-js/store'
import type { BracketInfo } from '../../workers/treeSitter/types'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createBracketState = () => {
	const [fileBrackets, setBracketsStore] = createStore<
		Record<string, BracketInfo[] | undefined>
	>({})

	const setBrackets = (path: string, brackets?: BracketInfo[]) => {
		if (!path) return
		const p = normalizePath(path)
		if (!brackets?.length) {
			setBracketsStore(p, undefined)
			return
		}

		setBracketsStore(p, brackets)
	}

	const clearBrackets = () => {
		setBracketsStore(reconcile({}))
	}

	return {
		fileBrackets,
		setBrackets,
		clearBrackets,
	}
}
