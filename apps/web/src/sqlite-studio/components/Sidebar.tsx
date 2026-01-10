import { For, Show } from 'solid-js'
import { Button } from '@repo/ui/button'
import { Flex } from '@repo/ui/flex'
import { ResetDatabaseButton } from './ResetDatabaseButton'
import { cn } from '@repo/ui/utils'

type SidebarProps = {
	tables: string[]
	selectedTable: string | null
	currentQuery: string
	onLoadTable: (table: string) => void
	onRefreshSchema: () => void
	setSqlQuery: (query: string) => void
	setSelectedTable: (table: string | null) => void
	onResetDatabase: () => void
	onLoadExample: (example: string) => void
}

export const Sidebar = (props: SidebarProps) => {
	return (
		<aside class="w-64 border-r border-border bg-card flex flex-col">
			<Flex
				flexDirection="col"
				alignItems="start"
				class="p-2 border-b border-border"
			>
				<h1 class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					One Table
				</h1>
				<div class="text-lg font-semibold text-foreground tracking-tight">
					SQLite Studio
				</div>
			</Flex>
			<div class="flex-1 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
				<div class="py-1 px-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Tables
				</div>
				<Flex flexDirection="col" alignItems="stretch" class="gap-0.5">
					<For each={props.tables}>
						{(table) => (
							<Button
								onClick={() => props.onLoadTable(table)}
								variant="ghost"
								class={cn(
									'w-full justify-start px-1 h-auto py-1 rounded-sm text-xs border',
									props.selectedTable === table
										? 'bg-primary/10 text-primary font-medium border-primary/20 hover:bg-primary/10'
										: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
								)}
							>
								{table}
							</Button>
						)}
					</For>
					<Show when={props.tables.length === 0}>
						<div class="px-3 py-2 text-sm text-muted-foreground italic">
							No tables found
						</div>
					</Show>
				</Flex>
				<div class="py-1 px-1 mt-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Examples
				</div>
				<div>
					<Button
						onClick={() => props.onLoadExample('file-search')}
						variant="ghost"
						class={cn(
							'w-full justify-start px-1 h-auto py-1 rounded-sm text-xs border',
							props.selectedTable === 'example:file-search'
								? 'bg-primary/10 text-primary font-medium border-primary/20 hover:bg-primary/10'
								: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
						)}
					>
						File Search
					</Button>
				</div>
			</div>
			<Flex flexDirection="col" class="p-4 border-t border-border gap-2">
				<Button
					onClick={() => props.onRefreshSchema()}
					variant="secondary"
					class="w-full justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-md text-xs font-medium"
					size="sm"
				>
					Refresh Schema
				</Button>
				<ResetDatabaseButton
					onReset={props.onResetDatabase}
					variant="sidebar"
				/>
			</Flex>
		</aside>
	)
}
