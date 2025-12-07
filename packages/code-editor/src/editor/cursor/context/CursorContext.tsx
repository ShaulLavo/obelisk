import { createContext, useContext } from 'solid-js'
import type { CursorContextValue, CursorProviderProps } from './types'
import { useCursorStateManager } from '../hooks/useCursorStateManager'
import { useCursorActions } from '../hooks/useCursorActions'

const CursorContext = createContext<CursorContextValue>()

export function CursorProvider(props: CursorProviderProps) {
	const { currentState, updateCurrentState } = useCursorStateManager({
		filePath: props.filePath,
		lineEntries: props.lineEntries,
		documentLength: props.documentLength
	})

	const actions = useCursorActions({
		currentState,
		updateCurrentState,
		lineEntries: props.lineEntries,
		documentText: props.documentText,
		documentLength: props.documentLength
	})

	const value: CursorContextValue = {
		get state() {
			return currentState()
		},
		actions,
		lineEntries: () => props.lineEntries(),
		documentText: () => props.documentText(),
		documentLength: () => props.documentLength()
	}

	return (
		<CursorContext.Provider value={value}>
			{props.children}
		</CursorContext.Provider>
	)
}

export function useCursor(): CursorContextValue {
	const ctx = useContext(CursorContext)
	if (!ctx) {
		throw new Error('useCursor must be used within a CursorProvider')
	}
	return ctx
}
