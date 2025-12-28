import { createStore, reconcile } from 'solid-js/store'
import type { BracketInfo } from '../../workers/treeSitter/types'

export const createBracketState = () => {
	const [fileBrackets, setBracketsStore] = createStore<
		Record<string, BracketInfo[] | undefined>
	>({})

	const setBrackets = (path: string, brackets?: BracketInfo[]) => {
		if (!path) return
		if (!brackets?.length) {
			setBracketsStore(path, undefined)
			return
		}

		setBracketsStore(path, brackets)
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
