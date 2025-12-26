import { logger } from '@repo/logger'
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

const log = logger.withTag('sqlite').debug

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

const ensureSchema = async () => {
	const c = getClient()
	await c.execute(`
		CREATE TABLE IF NOT EXISTS files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			path TEXT UNIQUE NOT NULL,
			path_lc TEXT NOT NULL,
			basename_lc TEXT NOT NULL,
			dir_lc TEXT NOT NULL,
			kind TEXT NOT NULL,
			recency INTEGER DEFAULT 0
		)
	`)
	await c.execute(
		'CREATE INDEX IF NOT EXISTS idx_files_path_lc ON files(path_lc)'
	)
	await c.execute(
		'CREATE INDEX IF NOT EXISTS idx_files_basename_lc ON files(basename_lc)'
	)
}

const performInit = async (): Promise<{
	version: string
	opfsEnabled: boolean
}> => {
	// Suppress verbose internal SQLite WASM logging (includes init messages sent to stderr)
	if (!sqlite3) {
		sqlite3 = await sqlite3InitModule({
			print: () => {},
			printErr: () => {},
			locateFile: (file: string) => {
				if (file.endsWith('.wasm')) return wasmUrl
				return file
			},
		})
	}

	const opfsEnabled = 'opfs' in sqlite3
	clientCofig = {
		url: opfsEnabled ? 'file:/vibe.sqlite3' : ':memory:',
	}
	;[client, db] = createClient(clientCofig, sqlite3)

	await ensureSchema()

	log(
		`[SQLite] v${sqlite3.version.libVersion} initialized. OPFS: ${opfsEnabled}, URL: ${clientCofig.url}`
	)

	return { version: sqlite3.version.libVersion, opfsEnabled }
}

const init = async (): Promise<{ version: string; opfsEnabled: boolean }> => {
	if (client && sqlite3) {
		return {
			version: sqlite3.version.libVersion,
			opfsEnabled: 'opfs' in sqlite3,
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

export type FileMetadata = {
	path: string
	kind: string
}

const batchInsertFiles = async (files: FileMetadata[]): Promise<void> => {
	if (files.length === 0) return
	const c = getClient()

	const placeholders = files.map(() => '(?, ?, ?, ?, ?)').join(',')
	const args: (string | number)[] = []

	for (const file of files) {
		const path_lc = file.path.toLowerCase()
		const basename_lc = file.path.split('/').pop()?.toLowerCase() ?? ''
		const dir_lc = file.path
			.substring(0, file.path.lastIndexOf('/'))
			.toLowerCase()

		args.push(file.path, path_lc, basename_lc, dir_lc, file.kind)
	}

	try {
		await c.execute({
			sql: `INSERT OR IGNORE INTO files (path, path_lc, basename_lc, dir_lc, kind) VALUES ${placeholders}`,
			args,
		})
	} catch (e) {
		log('Batch insert failed', e)
		throw e
	}
}

export type SearchResult = {
	id: number
	path: string
	kind: string
	recency: number
}

const searchFiles = async (
	query: string,
	limit = 50
): Promise<SearchResult[]> => {
	const c = getClient()
	const q = `%${query.toLowerCase()}%`

	const result = await c.execute({
		sql: `
			SELECT id, path, kind, recency 
			FROM files 
			WHERE path_lc LIKE ? 
			ORDER BY 
				CASE 
					WHEN basename_lc LIKE ? THEN 1 
					WHEN path_lc LIKE ? THEN 2 
					ELSE 3 
				END,
				recency DESC,
				path_lc ASC
			LIMIT ?
		`,
		args: [q, q, `${q}%`, limit],
	})

	return result.rows.map(
		(row) =>
			({
				id: row[0],
				path: row[1],
				kind: row[2],
				recency: row[3],
			}) as SearchResult
	)
}

const reset = async (): Promise<void> => {
	// 1. Close the database connection
	if (db) {
		try {
			db.close()
		} catch (e) {
			log('[SQLite] Error closing DB:', e)
		}
		db = null
		client = null
	}

	// 2. Delete the OPFS file
	try {
		const root = await navigator.storage.getDirectory()
		await root.removeEntry('vibe.sqlite3')
		log('[SQLite] OPFS file deleted')
	} catch (e) {
		log('[SQLite] Error deleting OPFS file (might not exist):', e)
	}

	// 3. Re-initialize
	initPromise = null
	await performInit()
	log('[SQLite] Re-initialized')

	log('[SQLite] Database reset complete (clean state)')
}

const workerApi = {
	init,
	exec,
	run,
	reset,
	batchInsertFiles,
	searchFiles,
}

export type SqliteWorkerApi = typeof workerApi

Comlink.expose(workerApi)
