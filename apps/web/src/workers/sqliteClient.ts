import { wrap, type Remote } from 'comlink'
import type { InArgs } from 'sqlite-wasm/client'
import type { SqliteWorkerApi, FileMetadata } from './sqlite'
export type { FileMetadata }

let sqliteApiInstance: Remote<SqliteWorkerApi> | null = null

const getWorker = (): Remote<SqliteWorkerApi> => {
	if (!sqliteApiInstance) {
		const worker = new Worker(new URL('./sqlite.ts', import.meta.url), {
			type: 'module',
		})
		sqliteApiInstance = wrap<SqliteWorkerApi>(worker)
	}
	return sqliteApiInstance
}

export const sqliteApi: Remote<SqliteWorkerApi> = new Proxy({} as Remote<SqliteWorkerApi>, {
	get(_target, prop, receiver) {
		return Reflect.get(getWorker(), prop, receiver)
	},
})

export const initSqlite = () => sqliteApi.init()

export const runSqliteQuery = <T = Record<string, unknown>>(
	sql: string,
	params?: Record<string, unknown> | unknown[]
) =>
	sqliteApi.run(sql, params as InArgs) as Promise<{
		columns: string[]
		rows: T[]
	}>

export const execSqliteQuery = (sql: string) => sqliteApi.exec(sql)

export const resetSqlite = () => sqliteApi.reset()

export const batchInsertFiles = (files: FileMetadata[]) =>
	sqliteApi.batchInsertFiles(files)

export const searchFiles = (query: string) => sqliteApi.searchFiles(query)

export const removeFromIndex = (
	path: string,
	options?: { recursive?: boolean }
) => sqliteApi.removeFromIndex(path, options)

export const renameInIndex = (
	oldPath: string,
	newPath: string,
	options?: { recursive?: boolean }
) => sqliteApi.renameInIndex(oldPath, newPath, options)
