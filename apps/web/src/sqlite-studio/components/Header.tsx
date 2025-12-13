import { Show } from 'solid-js'

type HeaderProps = {
	selectedTable: string | null
	hasRowId: boolean
	primaryKeys: string[]
}

export const Header = (props: HeaderProps) => {
	return (
		<header class="h-14 border-b border-zinc-800 flex items-center px-6 justify-between bg-[#0b0c0f]">
			<div class="flex items-center gap-4">
				<h2 class="text-sm font-medium text-zinc-200">
					{props.selectedTable ? (
						<span class="flex items-center gap-2">
							<span class="text-zinc-500">Table:</span>
							<span class="text-indigo-400">{props.selectedTable}</span>
							<Show when={props.hasRowId}>
								<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
									ROWID
								</span>
							</Show>
							<Show when={props.primaryKeys.length > 0}>
								<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
									PK: {props.primaryKeys.join(', ')}
								</span>
							</Show>
						</span>
					) : (
						<span class="text-zinc-500">Dashboard</span>
					)}
				</h2>
			</div>
			<div class="flex items-center gap-2"></div>
		</header>
	)
}
