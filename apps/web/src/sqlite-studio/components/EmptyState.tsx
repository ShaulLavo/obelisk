import { AiConsoleSql } from '@repo/icons/ai/AiConsoleSql'

export const EmptyState = () => {
	return (
		<div class="flex flex-col items-center justify-center h-64 text-zinc-500">
			<div class="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4 text-zinc-600">
				<AiConsoleSql size={24} />
			</div>
			<p>Select a table or run a query to get started</p>
		</div>
	)
}
