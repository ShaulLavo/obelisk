import type { HistoryProviderProps } from '../types'
import { HistoryContext } from './HistoryContext'
import { useHistoryStore } from '../hooks/useHistoryStore'

export const HistoryProvider = (props: HistoryProviderProps) => {
	// eslint-disable-next-line solid/reactivity
	const value = useHistoryStore(props.document)

	return (
		<HistoryContext.Provider value={value}>
			{props.children}
		</HistoryContext.Provider>
	)
}
