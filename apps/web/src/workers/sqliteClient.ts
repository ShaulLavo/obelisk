import { wrap, type Remote } from 'comlink'
import type { SqliteWorkerApi } from './sqlite'

const worker = new Worker(new URL('./sqlite.ts', import.meta.url), {
	type: 'module',
})

export const sqliteApi: Remote<SqliteWorkerApi> = wrap<SqliteWorkerApi>(worker)

export const initSqlite = () => sqliteApi.init()

export const runSqliteDemo = () => sqliteApi.runDemo()

export const runFtsDemo = (query?: string) => sqliteApi.runFtsDemo(query)
