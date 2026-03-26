/* @refresh reload */
import { render } from 'solid-js/web'
import { installPerfLoggerDevtools } from '@repo/perf'
// Only import devtools in development
if (import.meta.env.DEV) {
	import('solid-devtools')
}
import './styles.css'
import '@repo/code-editor/styles.css'

import App from './App'

installPerfLoggerDevtools()

const root = document.getElementById('root')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
	throw new Error(
		'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
	)
}

render(() => <App />, root!)
