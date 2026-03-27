/* eslint-disable solid/reactivity */
import { batch, createSignal, onMount } from 'solid-js'
import { makePersisted } from '@solid-primitives/storage'
import {
	initSqlite,
	resetSqlite,
	runSqliteQuery,
} from '../../workers/sqliteClient'
import { searchService } from '../../search/SearchService'
import { splitStatements } from '../utils/sqlUtils'
import type { SearchResult } from '../../search/types'

type TableInfo = {
	cid: number
	name: string
	type: string
	notnull: number
	dflt_value: unknown
	pk: number
}

// Helper to safely extract error message
const getErrorMessage = (e: unknown): string => {
	if (e instanceof Error) return e.message
	return String(e)
}

export const useSqliteStudio = () => {
	const [tables, setTables] = makePersisted(createSignal<string[]>([]), {
		name: 'sqlite_studio_tables',
	})
	const [selectedTable, setSelectedTable] = makePersisted(
		createSignal<string | null>(null),
		{ name: 'sqlite_studio_selected_table' }
	)
	const [tableData, setTableData] = createSignal<Record<string, unknown>[]>([])
	const [columns, setColumns] = createSignal<string[]>([])
	const [primaryKeys, setPrimaryKeys] = createSignal<string[]>([])
	const [hasRowId, setHasRowId] = createSignal(false)

	const [isLoading, setIsLoading] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [sqlQuery, setSqlQuery] = createSignal('')
	const [queryResults, setQueryResults] = createSignal<
		{ columns: string[]; rows: Record<string, unknown>[] }[] | null
	>(null)
	const [editingCell, setEditingCell] = createSignal<{
		row: Record<string, unknown>
		col: string
		value: unknown
	} | null>(null)

	// Search State
	const [searchQuery, setSearchQuery] = createSignal('')
	const [searchResults, setSearchResults] = createSignal<SearchResult[] | null>(
		null
	)

	const fetchTables = async () => {
		try {
			const res = await runSqliteQuery<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
			)
			setTables(res.rows.map((r) => r.name))
		} catch (e: unknown) {
			console.error(e)
			setError(getErrorMessage(e))
		}
	}

	const refreshTableData = async (tableName: string) => {
		let selectCols = '*'
		if (hasRowId()) {
			selectCols = 'rowid, *'
		}

		const res = await runSqliteQuery<Record<string, unknown>>(
			`SELECT ${selectCols} FROM "${tableName}" LIMIT 1000`
		)
		setTableData(res.rows)
	}

	const loadTable = async (tableName: string) => {
		batch(() => {
			setIsLoading(true)
			setError(null)
			setSelectedTable(tableName)
			setQueryResults(null)
			setPrimaryKeys([])
			setHasRowId(false)
			setEditingCell(null)
		})

		try {
			const info = await runSqliteQuery<TableInfo>(
				`PRAGMA table_info("${tableName}")`
			)
			const pks = info.rows
				.filter((c) => c.pk > 0)
				.sort((a, b) => a.pk - b.pk)
				.map((c) => c.name)
			setPrimaryKeys(pks)

			let rowIdAvailable = true
			try {
				await runSqliteQuery(`SELECT rowid FROM "${tableName}" LIMIT 1`)
			} catch {
				rowIdAvailable = false
			}
			setHasRowId(rowIdAvailable)

			// Set columns from table info (rowid is filtered out in display)
			setColumns(info.rows.map((c) => c.name))

			await refreshTableData(tableName)
		} catch (e: unknown) {
			setError(getErrorMessage(e))
		} finally {
			setIsLoading(false)
		}
	}

	const runCustomQuery = async (queryOverride?: string | Event) => {
		const sql = typeof queryOverride === 'string' ? queryOverride : sqlQuery()

		if (!sql.trim()) return
		batch(() => {
			setIsLoading(true)
			setError(null)
			setEditingCell(null)
			setQueryResults(null)
			setSearchResults(null)
			setSelectedTable(null)
		})
		try {
			const statements = splitStatements(sql)
			const results: { columns: string[]; rows: unknown[] }[] = []

			for (const stmt of statements) {
				const res = await runSqliteQuery<unknown>(stmt)
				results.push(res)
			}
			batch(() => {
				setQueryResults(
					results.filter((r) => r.rows.length > 0 || r.columns.length > 0) as {
						columns: string[]
						rows: Record<string, unknown>[]
					}[]
				)

				setColumns([])
			})

			// Refresh tables list in case of DDL
			await fetchTables()
		} catch (e: unknown) {
			setError(getErrorMessage(e))
		} finally {
			setIsLoading(false)
		}
	}

	const runSearch = async () => {
		const q = searchQuery()

		batch(() => {
			setIsLoading(true)
			setError(null)
		})

		try {
			const results = await searchService.search(q)
			setSearchResults(results)
		} catch (e: unknown) {
			setError(getErrorMessage(e))
		} finally {
			setIsLoading(false)
		}
	}

	const commitEdit = async () => {
		const cell = editingCell()
		const tableName = selectedTable()
		if (!cell || !tableName) return

		try {
			let whereClause = ''
			const params = [cell.value]

			if (hasRowId()) {
				whereClause = 'rowid = ?'
				params.push(cell.row['rowid'])
			} else if (primaryKeys().length > 0) {
				whereClause = primaryKeys()
					.map((pk) => `"${pk}" = ?`)
					.join(' AND ')
				primaryKeys().forEach((pk) => params.push(cell.row[pk]))
			} else {
				throw new Error('Cannot update: Table has no ROWID and no Primary Key.')
			}

			await runSqliteQuery(
				`UPDATE "${tableName}" SET "${cell.col}" = ? WHERE ${whereClause}`,
				params
			)
			setEditingCell(null)

			await refreshTableData(tableName)
		} catch (e: unknown) {
			setError(getErrorMessage(e))
		}
	}

	onMount(async () => {
		setIsLoading(true)
		try {
			await initSqlite()
			await fetchTables()
			const currentTable = selectedTable()
			if (currentTable && !currentTable.startsWith('example:')) {
				await loadTable(currentTable)
			} else if (currentTable === 'example:file-search') {
				await runSearch()
			} else {
				setIsLoading(false)
			}
		} catch (e) {
			console.error('[SqliteStudio] Failed to init:', e)
			setError('Failed to initialize SQLite client')
			setIsLoading(false)
		}
	})

	const resetDatabase = async () => {
		try {
			setIsLoading(true)
			await resetSqlite()
			batch(() => {
				setTables([])
				setSelectedTable(null)
				setQueryResults(null)
				setSearchResults(null)
				setTableData([])
				setColumns([])
				setPrimaryKeys([])
				setHasRowId(false)
				setEditingCell(null)
			})
			await fetchTables()
		} catch (e: unknown) {
			console.error(e)
			setError(getErrorMessage(e))
		} finally {
			setIsLoading(false)
		}
	}

	return {
		state: {
			tables,
			selectedTable,
			tableData,
			columns,
			primaryKeys,
			hasRowId,
			isLoading,
			error,
			sqlQuery,
			queryResults,
			editingCell,
			searchQuery,
			searchResults,
		},
		actions: {
			setSqlQuery,
			setEditingCell,
			setSelectedTable,
			loadTable,
			runCustomQuery,
			commitEdit,
			fetchTables,
			resetDatabase,
			setSearchQuery,
			runSearch,
			setSearchResults,
		},
	}
}
