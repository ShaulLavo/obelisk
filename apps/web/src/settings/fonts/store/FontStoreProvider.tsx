import { createContext, useContext, type JSX } from 'solid-js'
import { createFontStore, type FontStore } from './createFontStore'

const FontStoreContext = createContext<FontStore>()

export type FontStoreProviderProps = {
	children: JSX.Element
}

export function FontStoreProvider(props: FontStoreProviderProps) {
	const store = createFontStore()

	return (
		<FontStoreContext.Provider value={store}>
			{props.children}
		</FontStoreContext.Provider>
	)
}

export function useFontStore(): FontStore {
	const context = useContext(FontStoreContext)
	if (!context) {
		throw new Error('useFontStore must be used within a FontStoreProvider')
	}
	return context
}