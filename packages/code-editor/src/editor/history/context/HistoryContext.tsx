import { createContext, useContext } from 'solid-js'
import type { HistoryContextValue } from '../types'

export const HistoryContext = createContext<HistoryContextValue>()

export const useHistory = (): HistoryContextValue => {
	const ctx = useContext(HistoryContext)
	if (!ctx) {
		throw new Error('useHistory must be used within a HistoryProvider')
	}
	return ctx
}
