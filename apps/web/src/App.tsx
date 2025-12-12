import { type Component, onCleanup, onMount } from 'solid-js'
import Main from './Main'
import { Providers } from './Providers'
import { disposeTreeSitterWorker } from './treeSitter/workerClient'
import { initSqlite, runFtsDemo } from './workers/sqliteClient'

const App: Component = () => {
	onMount(async () => {
		const { version, opfsEnabled } = await initSqlite()
		console.log(`[App] SQLite ready: v${version}, OPFS: ${opfsEnabled}`)

		// Run FTS demo
		const fts = await runFtsDemo('SQLite database')
		console.log('[App] FTS Demo results:', fts)

		// Try another search - use prefix matching with *
		const fts2 = await runFtsDemo('WebAssembly OR browser*')
		console.log(
			'[App] FTS search "WebAssembly OR browser*":',
			fts2.searchResults
		)
	})

	onCleanup(() => {
		void disposeTreeSitterWorker()
	})
	return (
		<Providers>
			<Main />
		</Providers>
	)
}

export default App
