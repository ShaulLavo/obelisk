import { createStore, reconcile } from 'solid-js/store'
import type { BracketInfo } from '../../workers/treeSitter/types'
import { createFilePath } from '@repo/fs'

export const createBracketState = () => {
	const [fileBrackets, setBracketsStore] = createStore<
		Record<string, BracketInfo[] | undefined>
	>({})

	const setBrackets = (path: string, brackets?: BracketInfo[]) => {
		if (!path) return
		const p = createFilePath(path)
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
