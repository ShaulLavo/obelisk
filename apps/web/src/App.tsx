import { Route, Router } from '@solidjs/router'
import { type Component, onCleanup } from 'solid-js'
import { StoreBenchDashboard } from './bench/StoreBenchDashboard'
import { VfsPathBenchDashboard } from './bench/VfsPathBenchDashboard'
import Main from './Main'
import { Providers } from './Providers'
import { SqliteStudio } from './sqlite-studio/SqliteStudio'
import { disposeTreeSitterWorker } from './treeSitter/workerClient'

const App: Component = () => {
	onCleanup(() => {
		void disposeTreeSitterWorker()
	})
	return (
		<Providers>
			<Router>
				<Route path="/" component={Main} />
				<Route path="/bench" component={StoreBenchDashboard} />
				<Route path="/vfs-bench" component={VfsPathBenchDashboard} />
				<Route path="/sqlite" component={SqliteStudio} />
			</Router>
		</Providers>
	)
}

export default App
