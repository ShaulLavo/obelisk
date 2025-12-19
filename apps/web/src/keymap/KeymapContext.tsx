import {
	createContext,
	useContext,
	type ParentComponent,
	onMount,
	onCleanup,
} from 'solid-js'
import { createKeymapController } from '@repo/keyboard'

export type KeymapController = ReturnType<typeof createKeymapController>

const KeymapContext = createContext<KeymapController>()

export const KeymapProvider: ParentComponent = (props) => {
	const controller = createKeymapController()

	onMount(() => {
		// Attach to window by default
		controller.attach(window)
	})

	onCleanup(() => {
		controller.detach()
	})

	return (
		<KeymapContext.Provider value={controller}>
			{props.children}
		</KeymapContext.Provider>
	)
}

export const useKeymap = () => {
	const context = useContext(KeymapContext)
	if (!context) {
		throw new Error('useKeymap must be used within a KeymapProvider')
	}
	return context
}
