import { batch, createSignal, onMount } from 'solid-js'
import {
	initSqlite,
	resetSqlite,
	runSqliteQuery,
} from '../../workers/sqliteClient'
import { quoteIdentifier, splitStatements } from '../utils/sqlUtils'
import { EditingCell, TableInfo } from '../types'
type RunSqliteQueryResult = Awaited<ReturnType<typeof runSqliteQuery>>
export const useSqliteStudio = () => {
	const [tables, setTables] = createSignal<string[]>([])
	const [selectedTable, setSelectedTable] = createSignal<string | null>(null)
	const [tableData, setTableData] = createSignal<Record<string, any>[]>([])
	const [columns, setColumns] = createSignal<string[]>([])
	const [primaryKeys, setPrimaryKeys] = createSignal<string[]>([])
	const [hasRowId, setHasRowId] = createSignal(false)

	const [isLoading, setIsLoading] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [sqlQuery, setSqlQuery] = createSignal('')
	const [queryResults, setQueryResults] = createSignal<
		RunSqliteQueryResult[] | null
	>(null)
	const [editingCell, setEditingCell] = createSignal<EditingCell | null>(null)

	const fetchTables = async () => {
		try {
			const res = await runSqliteQuery<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
			)
			setTables(res.rows.map((r) => r.name))
		} catch (e: unknown) {
			console.error(e)
			if (e instanceof Error) {
				setError(e.message)
			} else setError('Failed to fetch tables')
		}
	}

	const refreshTableData = async (tableName: string) => {
		const safeTableName = quoteIdentifier(tableName)

		// Get columns to build safe select list
		const info = await runSqliteQuery<TableInfo>(
			`PRAGMA table_info(${safeTableName})`
		)
		const columnNames = info.rows.map((c) => c.name)
		let selectCols = columnNames.map(quoteIdentifier).join(', ')

		if (hasRowId()) {
			// Use __rowid alias if available to avoid collision with user columns
			if (!columnNames.includes('__rowid')) {
				selectCols = `rowid AS "__rowid", ${selectCols}`
			}
		}

		const res = await runSqliteQuery(
			`SELECT ${selectCols} FROM ${safeTableName} LIMIT 100`
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
				`PRAGMA table_info(${quoteIdentifier(tableName)})`
			)
			batch(() => {
				const pks = info.rows
					.filter((c) => c.pk > 0)
					.sort((a, b) => a.pk - b.pk)
					.map((c) => c.name)
				setPrimaryKeys(pks)
				setColumns(info.rows.map((c) => c.name))
			})

			let rowIdAvailable = true
			try {
				await runSqliteQuery(
					`SELECT rowid FROM ${quoteIdentifier(tableName)} LIMIT 1`
				)
			} catch (e) {
				rowIdAvailable = false
			}
			setHasRowId(rowIdAvailable)

			await refreshTableData(tableName)
		} catch (e: unknown) {
			if (e instanceof Error) {
				setError(e.message)
			} else setError('Failed to load table')
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
			setSelectedTable(null)
		})
		try {
			const statements = splitStatements(sql)
			const results: RunSqliteQueryResult[] = []

			for (const stmt of statements) {
				const res = await runSqliteQuery(stmt)
				results.push(res)
			}
			batch(() => {
				setQueryResults(
					results.filter((r) => r.rows.length > 0 || r.columns.length > 0)
				)

				setColumns([])
			})

			// Refresh tables list in case of DDL
			await fetchTables()
		} catch (e: any) {
			setError(e.message)
		} finally {
			setIsLoading(false)
		}
	}

	const commitEdit = async () => {
		const cell = editingCell()
		const tableName = selectedTable()
		if (!cell || !tableName) return

		try {
			const safeTableName = quoteIdentifier(tableName)
			let whereClause = ''
			const params = [cell.value]

			if (hasRowId()) {
				whereClause = 'rowid = ?'
				// Prefer __rowid alias if it was selected, otherwise fallback to rowid
				params.push(cell.row.__rowid ?? cell.row.rowid)
			} else if (primaryKeys().length > 0) {
				whereClause = primaryKeys()
					.map((pk) => `${quoteIdentifier(pk)} = ?`)
					.join(' AND ')
				primaryKeys().forEach((pk) => params.push(cell.row[pk]))
			} else {
				throw new Error('Cannot update: Table has no ROWID and no Primary Key.')
			}

			await runSqliteQuery(
				`UPDATE ${safeTableName} SET ${quoteIdentifier(cell.col)} = ? WHERE ${whereClause}`,
				params
			)
			setEditingCell(null)

			await refreshTableData(tableName)
		} catch (e: any) {
			setError(e.message)
		}
	}

	onMount(async () => {
		try {
			await initSqlite()
			await fetchTables()
		} catch (e) {
			console.error('[SqliteStudio] Failed to init:', e)
			setError('Failed to initialize SQLite client')
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
				setTableData([])
				setColumns([])
				setPrimaryKeys([])
				setHasRowId(false)
				setEditingCell(null)
			})
			await fetchTables()
		} catch (e: any) {
			console.error(e)
			setError(e.message)
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
		},
	}
}
