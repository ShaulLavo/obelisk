import { For, Show, type Accessor } from 'solid-js'

type ResultsTableProps = {
	columns: Accessor<string[]>
	rows: Accessor<Record<string, any>[]>
	selectedTable: Accessor<string | null>
	queryResults: Accessor<Record<string, any>[] | null>
	hasRowId: Accessor<boolean>
	primaryKeys: Accessor<string[]>
	editingCell: Accessor<{
		row: Record<string, any>
		col: string
		value: any
	} | null>
	setEditingCell: (
		cell: {
			row: Record<string, any>
			col: string
			value: any
		} | null
	) => void
	onCommitEdit: () => void
}

export const ResultsTable = (props: ResultsTableProps) => {
	return (
		<div class="rounded-lg border border-zinc-800 overflow-hidden bg-[#0b0c0f] shadow-sm">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm border-collapse">
					<thead>
						<tr class="bg-zinc-900/50 border-b border-zinc-800">
							<For each={props.columns().filter((c) => c !== 'rowid')}>
								{(col) => (
									<th class="px-4 py-2 font-medium text-zinc-400 whitespace-nowrap">
										{col}
									</th>
								)}
							</For>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800/50">
						<For
							each={props.rows()}
							fallback={
								<tr>
									<td
										colspan={props.columns().length}
										class="px-4 py-8 text-center text-zinc-600 italic"
									>
										No results
									</td>
								</tr>
							}
						>
							{(row) => (
								<tr class="hover:bg-zinc-800/30 transition-colors group">
									<For each={props.columns().filter((c) => c !== 'rowid')}>
										{(col) => (
											<td
												class={`pl-3 py-1 text-zinc-300 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis font-mono text-xs border-r border-zinc-800/30 last:border-r-0 ${
													props.hasRowId() || props.primaryKeys().length > 0
														? 'cursor-text hover:bg-zinc-800'
														: ''
												}`}
												onClick={() => {
													if (
														props.selectedTable() &&
														(props.hasRowId() || props.primaryKeys().length > 0)
													) {
														props.setEditingCell({
															row,
															col,
															value: row[col],
														})
													}
												}}
											>
												<Show
													when={
														props.editingCell()?.row === row &&
														props.editingCell()?.col === col
													}
													fallback={
														row[col] === null ? (
															<span class="text-zinc-600 italic">null</span>
														) : (
															String(row[col])
														)
													}
												>
													<input
														ref={(el) => setTimeout(() => el.focus(), 0)}
														value={String(props.editingCell()?.value ?? '')}
														class="w-full bg-zinc-900 text-white px-1 py-0.5 rounded border border-indigo-500 outline-none"
														onInput={(e) =>
															props.setEditingCell((prev) =>
																prev
																	? {
																			...prev,
																			value: e.currentTarget.value,
																		}
																	: null
															)
														}
														onBlur={() => props.onCommitEdit()}
														onKeyDown={(e) => {
															if (e.key === 'Enter') props.onCommitEdit()
															if (e.key === 'Escape') props.setEditingCell(null)
														}}
													/>
												</Show>
											</td>
										)}
									</For>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
			<div class="px-4 py-2 bg-zinc-900/30 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between">
				<span>Showing {props.rows().length} rows</span>
				<span class="font-mono opacity-50">
					{props.selectedTable()
						? `Source: ${props.selectedTable()}`
						: 'Custom Query'}
				</span>
			</div>
		</div>
	)
}
