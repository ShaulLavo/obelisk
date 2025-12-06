import { type Component, onMount } from 'solid-js'
import Main from './Main'
import { Toaster } from '@repo/ui/toaster'
import { FsProvider } from './fs/context/FsProvider'
import { FocusProvider } from './focus/focusManager'
import { pingServerRoutes } from '~/serverRoutesProbe'
const App: Component = () => {
	onMount(() => {
		void pingServerRoutes()
	})

	return (
		<FocusProvider>
			<FsProvider>
				<Main />
				<Toaster />
			</FsProvider>
		</FocusProvider>
	)
}

export default App
