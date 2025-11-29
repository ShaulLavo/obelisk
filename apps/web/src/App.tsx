import { type Component } from 'solid-js'
import { FsProvider } from './fs/FsContext'
import Main from './Main'
import { Toaster } from '@repo/ui/toaster'
const App: Component = () => (
	<FsProvider>
		<Main />
		<Toaster />
	</FsProvider>
)

export default App
