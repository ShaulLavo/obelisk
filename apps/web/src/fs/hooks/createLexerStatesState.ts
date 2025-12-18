import { createStore, reconcile } from 'solid-js/store'
import type { LineState } from '@repo/code-editor'

export const createLexerStatesState = () => {
	const [fileLexerStates, setLexerStatesStore] = createStore<
		Record<string, LineState[] | undefined>
	>({})

	const setLexerLineStates = (path: string, states?: LineState[]) => {
		if (!path) return
		if (!states?.length) {
			setLexerStatesStore(path, undefined)
			return
		}

		setLexerStatesStore(path, states)
	}

	const clearLexerStates = () => {
		setLexerStatesStore(reconcile({}))
	}

	return {
		fileLexerStates,
		setLexerLineStates,
		clearLexerStates,
	}
}
