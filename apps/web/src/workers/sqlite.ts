import * as Comlink from 'comlink'
import sqlite3InitModule, {
	type Database,
	type Sqlite3Static,
} from 'sqlite-wasm'
import {
	createClient,
	type Sqlite3Client,
	type Config,
	type InArgs,
} from 'sqlite-wasm/client'
import wasmUrl from 'sqlite-wasm/sqlite3.wasm?url'
import proxyUrl from 'sqlite-wasm/sqlite3-opfs-async-proxy.js?url'
import * as searchImpl from './searchImpl'
import type { FileMetadata, SearchResult } from '../search/types'

let sqlite3: Sqlite3Static | null = null
let client: Sqlite3Client | null = null
let db: Database | null = null
let initPromise: Promise<{ version: string; opfsEnabled: boolean }> | null =
	null
let clientCofig: Config = { url: 'file:/vibe.sqlite3' }

const getClient = (): Sqlite3Client => {
	if (!client) {
		throw new Error('SQLite not initialized. Call init() first.')
	}
	return client
}

const performInit = async (): Promise<{
	version: string
	opfsEnabled: boolean
}> => {
	if (!sqlite3) {
		// TODO: Uncomment suppression once we verify OPFS is working
		// // Temporarily suppress console to avoid spurious OPFS timeout warning
		// // The warning is logged by sqlite3 internally even when OPFS works
		// const originalWarn = console.warn
		// console.warn = (...args: unknown[]) => {
		// 	const msg = String(args[0] ?? '')
		// 	if (msg.includes('OPFS') && msg.includes('Timeout')) return
		// 	originalWarn.apply(console, args)
		// }

		// try {
		sqlite3 = await sqlite3InitModule({
			print: () => {},
			printErr: () => {},
			locateFile: (file: string) => {
				if (file.endsWith('.wasm')) return wasmUrl
				return file
			},
			opfsProxyUrl: proxyUrl,
		})
		// } finally {
		// 	console.warn = originalWarn
		// }
	}

	const opfsEnabled = 'opfs' in sqlite3
	clientCofig = {
		url: opfsEnabled ? 'file:/vibe.sqlite3' : ':memory:',
	}
	;[client, db] = createClient(clientCofig, sqlite3)

	await searchImpl.ensureSchema(client)

	// Verify OPFS is actually working by checking available VFS
	const vfsList = sqlite3.capi.sqlite3_js_vfs_list?.() ?? []
	const hasOpfsVfs = vfsList.includes('opfs')

	if (opfsEnabled && !hasOpfsVfs) {
		console.error('[SQLite] OPFS check passed but VFS not installed! Using:', clientCofig.url)
	}

	return { version: sqlite3.version.libVersion, opfsEnabled: opfsEnabled && hasOpfsVfs }
}

const init = async (): Promise<{ version: string; opfsEnabled: boolean }> => {
	if (client && sqlite3) {
		const vfsList = sqlite3.capi.sqlite3_js_vfs_list?.() ?? []
		return {
			version: sqlite3.version.libVersion,
			opfsEnabled: 'opfs' in sqlite3 && vfsList.includes('opfs'),
		}
	}
	if (!initPromise) {
		initPromise = performInit()
	}
	return initPromise
}

const exec = async (sql: string): Promise<void> => {
	await getClient().execute(sql)
}

const run = async <T = Record<string, unknown>>(
	sql: string,
	params?: InArgs
): Promise<{ columns: string[]; rows: T[] }> => {
	const result = await getClient().execute({
		sql,
		args: params,
	})

	const rows = result.rows.map((row) => {
		const obj: Record<string, unknown> = {}
		for (const col of result.columns) {
			const index = result.columns.indexOf(col)
			obj[col] = row[index]
		}
		return obj as T
	})

	return {
		columns: result.columns,
		rows,
	}
}

const batchInsertFiles = async (files: FileMetadata[]): Promise<void> => {
	return searchImpl.batchInsertFiles(getClient(), files)
}

const searchFiles = async (query: string): Promise<SearchResult[]> => {
	return searchImpl.searchFiles(getClient(), query)
}

const removeFromIndex = async (
	path: string,
	options?: { recursive?: boolean }
): Promise<number> => {
	return searchImpl.removeFromIndex(getClient(), path, options)
}

const renameInIndex = async (
	oldPath: string,
	newPath: string,
	options?: { recursive?: boolean }
): Promise<number> => {
	return searchImpl.renameInIndex(getClient(), oldPath, newPath, options)
}

const reset = async (): Promise<void> => {
	if (db) {
		try {
			db.close()
		} catch {
			// Ignore close errors
		}
		db = null
		client = null
	}

	try {
		const root = await navigator.storage.getDirectory()
		await root.removeEntry('vibe.sqlite3')
	} catch {
		// OPFS file might not exist
	}

	initPromise = null
	await performInit()
}

const workerApi = {
	init,
	exec,
	run,
	reset,
	batchInsertFiles,
	searchFiles,
	removeFromIndex,
	renameInIndex,
}

export type SqliteWorkerApi = typeof workerApi
export type { FileMetadata, SearchResult }

Comlink.expose(workerApi)
