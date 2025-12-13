import { batch, For, Show } from 'solid-js'
import { PRESETS } from '../utils/presets'
import { ResetDatabaseButton } from './ResetDatabaseButton'

type SidebarProps = {
	tables: string[]
	selectedTable: string | null
	currentQuery: string
	onLoadTable: (table: string) => void
	onRefreshSchema: () => void
	onRunPreset: (query: string) => void
	setSqlQuery: (query: string) => void
	setSelectedTable: (table: string | null) => void
	onResetDatabase: () => void
}

export const Sidebar = (props: SidebarProps) => {
	return (
		<aside class="w-64 border-r border-zinc-800 bg-[#0b0c0f] flex flex-col">
			<div class="p-2 border-b border-zinc-800">
				<h1 class="text-xs font-bold tracking-widest text-zinc-500 uppercase">
					One Table
				</h1>
				<div class="text-lg font-semibold text-white tracking-tight">
					SQLite Studio
				</div>
			</div>
			<div class="flex-1 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
				<div class="py-1 px-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
					Tables
				</div>
				<div>
					<For each={props.tables}>
						{(table) => (
							<button
								onClick={() => props.onLoadTable(table)}
								class="w-full text-left px-1 pb-1 rounded-sm text-xs transition-colors border"
								classList={{
									'bg-indigo-500/10 text-indigo-400 font-medium border-indigo-500/20':
										props.selectedTable === table,
									'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-transparent':
										props.selectedTable !== table,
								}}
							>
								{table}
							</button>
						)}
					</For>
					<Show when={props.tables.length === 0}>
						<div class="px-3 py-2 text-sm text-zinc-600 italic">
							No tables found
						</div>
					</Show>
				</div>
				<div class="py-1 px-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
					Examples
				</div>
				<div>
					<For each={Object.values(PRESETS)}>
						{(preset) => (
							<button
								onClick={() => {
									batch(() => {
										props.setSqlQuery(preset.sql)
										props.setSelectedTable(null)
									})
									props.onRunPreset(preset.sql)
								}}
								class="w-full text-left px-1 pb-1 rounded-sm text-xs transition-colors border"
								classList={{
									'bg-indigo-500/10 text-indigo-400 font-medium border-indigo-500/20':
										!props.selectedTable &&
										(props.currentQuery || '').trim() === preset.sql.trim(),
									'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-transparent':
										Boolean(props.selectedTable) ||
										(props.currentQuery || '').trim() !== preset.sql.trim(),
								}}
							>
								{preset.name}
							</button>
						)}
					</For>
				</div>
			</div>
			<div class="p-4 border-t border-zinc-800 space-y-2">
				<button
					onClick={props.onRefreshSchema}
					class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium transition-colors"
				>
					Refresh Schema
				</button>
				<ResetDatabaseButton
					onReset={props.onResetDatabase}
					variant="sidebar"
				/>
			</div>
		</aside>
	)
}
