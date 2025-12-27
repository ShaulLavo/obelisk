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
import proxyUrl from 'sqlite-wasm/sqlite3-opfs-async-proxy.js?url'

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
			basename_initials TEXT NOT NULL, 
			dir_lc TEXT NOT NULL,
			kind TEXT NOT NULL,
			recency INTEGER DEFAULT 0
		)
	`)

	try {
		const result = await c.execute('PRAGMA table_info(files)')
		// result.rows is array of arrays, result.columns is array of column names
		const nameIdx = result.columns.indexOf('name')
		if (nameIdx !== -1) {
			const hasInitials = result.rows.some(
				(row) => row[nameIdx] === 'basename_initials'
			)
			if (!hasInitials) {
				log('[SQLite] Migrating: Adding basename_initials column')
				await c.execute(
					"ALTER TABLE files ADD COLUMN basename_initials TEXT NOT NULL DEFAULT ''"
				)
			}
		}
	} catch (e) {
		log('[SQLite] Migration check failed', e)
	}

	await c.execute(
		'CREATE INDEX IF NOT EXISTS idx_files_path_lc ON files(path_lc)'
	)
	await c.execute(
		'CREATE INDEX IF NOT EXISTS idx_files_basename_lc ON files(basename_lc)'
	)
	await c.execute(
		'CREATE INDEX IF NOT EXISTS idx_files_basename_initials ON files(basename_initials)'
	)
}

const performInit = async (): Promise<{
	version: string
	opfsEnabled: boolean
}> => {
	if (!sqlite3) {
		sqlite3 = await sqlite3InitModule({
			print: () => {},
			printErr: () => {},
			locateFile: (file: string) => {
				if (file.endsWith('.wasm')) return wasmUrl
				return file
			},
			opfsProxyUrl: proxyUrl,
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

const getInitials = (basename: string): string => {
	const name = basename.split('.').shift() ?? ''
	if (!name) return ''

	const parts = name.split(/[^a-zA-Z0-9]|(?=[A-Z])/)

	return parts
		.filter((p) => p.length > 0)
		.map((p) => p.charAt(0).toLowerCase())
		.join('')
}

const batchInsertFiles = async (files: FileMetadata[]): Promise<void> => {
	if (files.length === 0) return
	const c = getClient()

	const placeholders = files.map(() => '(?, ?, ?, ?, ?, ?)').join(',')
	const args: (string | number)[] = []

	for (const file of files) {
		const path_lc = file.path.toLowerCase()
		const basename = file.path.split('/').pop() ?? ''
		const basename_lc = basename.toLowerCase()
		const basename_initials = getInitials(basename)

		const dir_lc = file.path
			.substring(0, file.path.lastIndexOf('/'))
			.toLowerCase()

		args.push(
			file.path,
			path_lc,
			basename_lc,
			basename_initials,
			dir_lc,
			file.kind
		)
	}

	try {
		await c.execute({
			sql: `INSERT OR IGNORE INTO files (path, path_lc, basename_lc, basename_initials, dir_lc, kind) VALUES ${placeholders}`,
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

const SEARCH_PREFIX_SQL = `
	SELECT id, path, kind, recency 
	FROM files 
	WHERE basename_lc LIKE ? OR basename_initials LIKE ?
	ORDER BY recency DESC, path_lc ASC
	LIMIT 1000
`

const SEARCH_FUZZY_SQL = `
	SELECT id, path, kind, recency 
	FROM files 
	WHERE path_lc LIKE ? OR basename_initials LIKE ?
	ORDER BY 
		CASE 
			WHEN basename_lc LIKE ? THEN 1
			WHEN basename_initials LIKE ? THEN 2
			ELSE 3
		END,
		recency DESC, 
		length(path_lc) ASC
	LIMIT 1000
`

const searchFiles = async (query: string): Promise<SearchResult[]> => {
	const c = getClient()
	const qLower = query.toLowerCase()

	const usePrefix = qLower.length <= 1
	const pattern = usePrefix
		? `${qLower}%`
		: '%' + qLower.split('').join('%') + '%'
	const prefixPattern = `${qLower}%`

	const result = await c.execute({
		sql: usePrefix ? SEARCH_PREFIX_SQL : SEARCH_FUZZY_SQL,
		args: usePrefix
			? [prefixPattern, prefixPattern]
			: [pattern, prefixPattern, prefixPattern, prefixPattern],
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
	if (db) {
		try {
			db.close()
		} catch (e) {
			log('[SQLite] Error closing DB:', e)
		}
		db = null
		client = null
	}

	try {
		const root = await navigator.storage.getDirectory()
		await root.removeEntry('vibe.sqlite3')
		log('[SQLite] OPFS file deleted')
	} catch (e) {
		log('[SQLite] Error deleting OPFS file (might not exist):', e)
	}

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
