import { logger } from '@repo/logger'
import * as Comlink from 'comlink'
import { InArgs } from 'node_modules/sqlite-wasm/dist/client/api'
import sqlite3InitModule, {
	type Database,
	type Sqlite3Static,
} from 'sqlite-wasm'
import {
	createClient,
	type Sqlite3Client,
	type Config,
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

const runDemo = async (): Promise<{
	tables: string[]
	users: { id: number; name: string }[]
}> => {
	const c = getClient()

	// Create a demo table
	await c.execute(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`)

	// Insert some demo data
	await c.execute(`
		INSERT OR IGNORE INTO users (id, name) VALUES
			(1, 'Alice'),
			(2, 'Bob'),
			(3, 'Charlie')
	`)

	// Query the data
	const usersResult = await c.execute('SELECT id, name FROM users ORDER BY id')
	const users = usersResult.rows.map((row) => ({
		id: row[0] as number,
		name: row[1] as string,
	}))

	// Get list of tables
	const tablesResult = await c.execute(
		"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
	)
	const tables = tablesResult.rows.map((row) => row[0] as string)

	log('[SQLite Demo] Tables:', tables)
	log('[SQLite Demo] Users:', users)

	return { tables, users }
}

type FtsResult = {
	id: number
	title: string
	content: string
	rank: number
}

const runFtsDemo = async (
	searchQuery?: string
): Promise<{ documents: FtsResult[]; searchResults: FtsResult[] }> => {
	const c = getClient()

	// Create FTS5 virtual table for full-text search
	await c.execute(`
		CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
			title,
			content,
			content='',
			contentless_delete=1
		)
	`)

	// Create a regular table to store document metadata
	await c.execute(`
		CREATE TABLE IF NOT EXISTS documents (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			content TEXT NOT NULL
		)
	`)

	// Check if we already have demo data
	const countResult = await c.execute('SELECT COUNT(*) as cnt FROM documents')
	// row[0] is the first column value
	const count = countResult.rows[0]?.[0] as number

	if (count === 0) {
		// Insert demo documents
		const docs = [
			{
				title: 'Introduction to SQLite',
				content:
					'SQLite is a C library that provides a lightweight disk-based database. It allows accessing the database using SQL queries without a separate server process.',
			},
			{
				title: 'Full-Text Search with FTS5',
				content:
					'FTS5 is an SQLite virtual table module that provides full-text search functionality. It supports advanced features like phrase queries and boolean operators.',
			},
			{
				title: 'WebAssembly and Databases',
				content:
					'Running SQLite in WebAssembly allows browsers to have a local database. This enables offline-first applications with powerful querying capabilities.',
			},
			{
				title: 'OPFS Storage in Browsers',
				content:
					'The Origin Private File System (OPFS) provides high-performance file access for web applications, perfect for persisting SQLite databases.',
			},
			{
				title: 'JavaScript and SQL Integration',
				content:
					'Modern web applications can use SQL for local data management. Libraries like sql.js and sqlite-wasm bring the power of SQL to the browser.',
			},
		]

		for (const doc of docs) {
			await c.execute({
				sql: 'INSERT INTO documents (title, content) VALUES (?, ?)',
				args: [doc.title, doc.content],
			})
			// Get the last inserted rowid
			const lastIdResult = await c.execute('SELECT last_insert_rowid() as id')
			const lastId = lastIdResult.rows[0]?.[0] as number

			// Index in FTS
			await c.execute({
				sql: 'INSERT INTO documents_fts (rowid, title, content) VALUES (?, ?, ?)',
				args: [lastId, doc.title, doc.content],
			})
		}
	}

	// Get all documents
	const documentsResult = await c.execute(
		'SELECT id, title, content, 0 as rank FROM documents ORDER BY id'
	)
	const documents = documentsResult.rows.map(
		(row) =>
			({
				id: row[0] as number,
				title: row[1] as string,
				content: row[2] as string,
				rank: row[3] as number,
			}) as FtsResult
	)

	// Perform FTS search if query provided
	const query = searchQuery || 'SQLite database'

	const searchResult = await c.execute({
		sql: `
			SELECT 
				d.id,
				d.title,
				d.content,
				rank
			FROM documents_fts f
			JOIN documents d ON d.id = f.rowid
			WHERE documents_fts MATCH ?
			ORDER BY rank
		`,
		args: [query],
	})

	const searchResults = searchResult.rows.map(
		(row) =>
			({
				id: row[0] as number,
				title: row[1] as string,
				content: row[2] as string,
				rank: row[3] as number,
			}) as FtsResult
	)

	log('[SQLite FTS Demo] Documents indexed:', documents.length)
	log(`[SQLite FTS Demo] Search "${query}":`, searchResults)

	return { documents, searchResults }
}

const runVectorDemo = async (): Promise<void> => {
	const c = getClient()
	try {
		await c.execute('SELECT vec_version()')
	} catch (e) {
		log('[SQLite] Vector extension not available, skipping vector demo')
		return
	}

	await c.execute('DROP TABLE IF EXISTS embeddings')
	await c.execute(
		'CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(vector float[4])'
	)

	// Check if data exists
	const countResult = await c.execute('SELECT COUNT(*) as cnt FROM embeddings')
	const count = countResult.rows[0]?.[0] as number

	if (count === 0) {
		await c.execute(`
			INSERT INTO embeddings(rowid, vector) VALUES 
			(1, '[1.0, 0.0, 0.0, 0.0]'),
			(2, '[0.0, 1.0, 0.0, 0.0]'),
			(3, '[0.9, 0.1, 0.0, 0.0]')
		`)
	}
	log('[SQLite Vector Demo] Embeddings initialized')
}

const reset = async (): Promise<void> => {
	// 1. Close the database connection
	if (db) {
		try {
			// @ts-ignore - close might not be in the type definition but is available
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

	// 4. Re-seed data
	await runDemo()
	await runFtsDemo()
	await runVectorDemo()

	log('[SQLite] Database reset complete')
}

const workerApi = {
	init,
	exec,
	run,
	runDemo,
	runFtsDemo,
	runVectorDemo,
	reset,
}

export type SqliteWorkerApi = typeof workerApi

Comlink.expose(workerApi)
