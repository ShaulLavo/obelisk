import { For, Show, type Component } from 'solid-js'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { QueryEditor } from './components/QueryEditor'
import { ResultsTable } from './components/ResultsTable'
import { Sidebar } from './components/Sidebar'
import { ResetDatabaseButton } from './components/ResetDatabaseButton'
import { useSqliteStudio } from './hooks/useSqliteStudio'
import { SearchFiles } from './components/SearchFiles'
import { Flex } from '@repo/ui/flex'
import { Alert, AlertDescription } from '@repo/ui/alert'

export const SqliteStudio: Component = () => {
	const { state, actions } = useSqliteStudio()

	const handleLoadExample = (example: string) => {
		actions.setSelectedTable(`example:${example}`)
		actions.setSqlQuery('')
	}

	return (
		<Flex
			class="h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30"
			alignItems="stretch"
			justifyContent="start"
		>
			<Sidebar
				tables={state.tables()}
				selectedTable={state.selectedTable()}
				currentQuery={state.sqlQuery()}
				onLoadTable={actions.loadTable}
				onRefreshSchema={actions.fetchTables}
				setSqlQuery={actions.setSqlQuery}
				setSelectedTable={actions.setSelectedTable}
				onResetDatabase={actions.resetDatabase}
				onLoadExample={handleLoadExample}
			/>

			<Flex
				flexDirection="col"
				class="flex-1 min-w-0 bg-background"
				alignItems="stretch"
			>
				<Header
					selectedTable={state.selectedTable()}
					hasRowId={state.hasRowId()}
					primaryKeys={state.primaryKeys()}
				/>

				<Show when={state.selectedTable() === 'example:file-search'}>
					<SearchFiles
						searchQuery={state.searchQuery}
						setSearchQuery={actions.setSearchQuery}
						onSearch={actions.runSearch}
						results={state.searchResults}
						isLoading={state.isLoading}
					/>
				</Show>

				<Show when={!state.selectedTable()}>
					<QueryEditor
						sqlQuery={state.sqlQuery}
						setSqlQuery={actions.setSqlQuery}
						onRunQuery={actions.runCustomQuery}
					/>
				</Show>

				<Show when={!state.selectedTable()?.startsWith('example:')}>
					<Flex
						flexDirection="col"
						alignItems="stretch"
						class="flex-1 p-2 min-h-0"
					>
						<Show when={state.error()}>
							<Alert
								variant="destructive"
								class="mb-4 bg-destructive/10 border-destructive/20 justify-between"
							>
								<AlertDescription class="flex items-center justify-between w-full">
									<span>{state.error()}</span>
									<Show
										when={state.error()?.includes('invalid fts5 file format')}
									>
										<ResetDatabaseButton
											onReset={actions.resetDatabase}
											variant="error"
										/>
									</Show>
								</AlertDescription>
							</Alert>
						</Show>

						<Show when={state.isLoading()}>
							<Flex
								justifyContent="center"
								class="h-32 text-muted-foreground text-sm animate-pulse"
							>
								Loading data...
							</Flex>
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
								<Flex flexDirection="col" alignItems="stretch" class="gap-8">
									<For each={state.queryResults()}>
										{(result, index) => (
											<Flex
												flexDirection="col"
												alignItems="stretch"
												class="gap-2"
											>
												<Flex class="text-xs font-mono text-muted-foreground px-1">
													Result {index() + 1}
												</Flex>
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
											</Flex>
										)}
									</For>
								</Flex>
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
					</Flex>
				</Show>
			</Flex>
		</Flex>
	)
}
