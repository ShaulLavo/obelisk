import { type Component } from 'solid-js'
import Main from './Main'
import { Toaster } from '@repo/ui/toaster'
import { FsProvider } from './fs/context/FsProvider'
const App: Component = () => (
	<FsProvider>
		<Main />
		<Toaster />
	</FsProvider>
)

export default App
