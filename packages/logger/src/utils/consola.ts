import {
	createConsola,
	type ConsolaInstance,
	type ConsolaOptions
} from 'consola'
import { loggerEnv } from '../env'

const consola = createConsola({
	// `fancy` is a node-only flag that isn't exposed in the browser .d.ts, so cast.
	fancy: true
} as Partial<ConsolaOptions> & { fancy: boolean })

const DEFAULT_LEVEL = loggerEnv.loggerLevel ?? (loggerEnv.isDev ? 4 : 3)
consola.level = DEFAULT_LEVEL

export { consola }
export type { ConsolaInstance }
