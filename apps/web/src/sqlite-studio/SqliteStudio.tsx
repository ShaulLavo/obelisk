import { For, Show, type Component } from 'solid-js'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { QueryEditor } from './components/QueryEditor'
import { ResultsTable } from './components/ResultsTable'
import { Sidebar } from './components/Sidebar'
import { ResetDatabaseButton } from './components/ResetDatabaseButton'
import { useSqliteStudio } from './hooks/useSqliteStudio'

export const SqliteStudio: Component = () => {
	const { state, actions } = useSqliteStudio()

	return (
		<div class="flex h-screen w-full bg-[#0b0c0f] text-zinc-100 font-sans selection:bg-indigo-500/30">
			<Sidebar
				tables={state.tables()}
				selectedTable={state.selectedTable()}
				currentQuery={state.sqlQuery()}
				onLoadTable={actions.loadTable}
				onRefreshSchema={actions.fetchTables}
				onRunPreset={actions.runCustomQuery}
				setSqlQuery={actions.setSqlQuery}
				setSelectedTable={actions.setSelectedTable}
				onResetDatabase={actions.resetDatabase}
			/>

			<main class="flex-1 flex flex-col min-w-0 bg-[#0f1014]">
				<Header
					selectedTable={state.selectedTable()}
					hasRowId={state.hasRowId()}
					primaryKeys={state.primaryKeys()}
				/>

				<QueryEditor
					sqlQuery={state.sqlQuery}
					setSqlQuery={actions.setSqlQuery}
					onRunQuery={actions.runCustomQuery}
				/>

				<div class="flex-1 overflow-auto p-2">
					<Show when={state.error()}>
						<div class="mb-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between">
							<span>{state.error()}</span>
							<Show when={state.error()?.includes('invalid fts5 file format')}>
								<ResetDatabaseButton
									onReset={actions.resetDatabase}
									variant="error"
								/>
							</Show>
						</div>
					</Show>

					<Show when={state.isLoading()}>
						<div class="flex items-center justify-center h-32 text-zinc-500 text-sm animate-pulse">
							Loading data...
						</div>
					</Show>

					<Show
						when={
							!state.isLoading() &&
							(state.selectedTable() || state.queryResults())
						}
					>
						<Show when={state.selectedTable()}>
							<ResultsTable
								columns={state.columns}
								rows={state.tableData}
								selectedTable={state.selectedTable}
								queryResults={() => null}
								hasRowId={state.hasRowId}
								primaryKeys={state.primaryKeys}
								editingCell={state.editingCell}
								setEditingCell={actions.setEditingCell}
								onCommitEdit={actions.commitEdit}
							/>
						</Show>
						<Show when={!state.selectedTable() && state.queryResults()}>
							<div class="flex flex-col gap-8">
								<For each={state.queryResults()}>
									{(result, index) => (
										<div class="flex flex-col gap-2">
											<div class="text-xs font-mono text-zinc-500 px-1">
												Result {index() + 1}
											</div>
											<ResultsTable
												columns={() => result.columns}
												rows={() => result.rows}
												selectedTable={() => null}
												queryResults={() => null}
												hasRowId={() => false}
												primaryKeys={() => []}
												editingCell={() => null}
												setEditingCell={() => {}}
												onCommitEdit={() => {}}
											/>
										</div>
									)}
								</For>
							</div>
						</Show>
					</Show>

					<Show
						when={
							!state.selectedTable() &&
							!state.queryResults() &&
							!state.isLoading()
						}
					>
						<EmptyState />
					</Show>
				</div>
			</main>
		</div>
	)
}
