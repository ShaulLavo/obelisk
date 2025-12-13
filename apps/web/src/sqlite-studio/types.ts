export type TableInfo = {
	cid: number
	name: string
	type: string
	notnull: number
	dflt_value: any
	pk: number
}

export type EditingCell = {
	row: Record<string, any>
	col: string
	value: any
}
