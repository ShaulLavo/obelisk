import {
	createConsola,
	type ConsolaInstance,
	type ConsolaOptions
} from 'consola'

const consola = createConsola({
	// `fancy` is a node-only flag that isn't exposed in the browser .d.ts, so cast.
	fancy: true
} as Partial<ConsolaOptions> & { fancy: boolean })

const DEFAULT_LEVEL = 4
consola.level = DEFAULT_LEVEL

export { consola }
export type { ConsolaInstance }
