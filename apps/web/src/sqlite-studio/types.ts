export type SqliteValue = string | number | null | Uint8Array

export type TableInfo = {
	cid: number
	name: string
	type: string
	notnull: number
	dflt_value: SqliteValue
	pk: number
}

export type EditingCell = {
	row: Record<string, SqliteValue>
	col: string
	value: SqliteValue
}
