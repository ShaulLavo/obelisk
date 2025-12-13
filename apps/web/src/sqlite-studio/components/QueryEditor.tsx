import { type Accessor } from 'solid-js'

type QueryEditorProps = {
	sqlQuery: Accessor<string>
	setSqlQuery: (query: string) => void
	onRunQuery: () => void
}

export const QueryEditor = (props: QueryEditorProps) => {
	return (
		<div class="border-b border-zinc-800 bg-[#0b0c0f]">
			<div class="relative group pl-3">
				<textarea
					value={props.sqlQuery()}
					onInput={(e) => props.setSqlQuery(e.currentTarget.value)}
					placeholder="Enter SQL query..."
					class="w-full h-40 bg-[#0b0c0f] p-2 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none resize-none leading-normal block"
					onKeyDown={(e) => {
						if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
							props.onRunQuery()
						}
					}}
				/>
				<div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
					<button
						onClick={() => props.onRunQuery()}
						class="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors shadow-lg shadow-indigo-900/20 uppercase tracking-wide"
					>
						Run
					</button>
				</div>
			</div>
		</div>
	)
}
