import { Component, For, Show } from 'solid-js'
import { Tab } from './Tab'

export type TabsProps = {
	values: string[]
	activeValue?: string
	onSelect?: (value: string) => void
	getLabel?: (value: string) => string
	emptyLabel?: string
}

export const Tabs: Component<TabsProps> = (props) => {
	const labelFor = (value: string) =>
		props.getLabel ? props.getLabel(value) : value

	return (
		<div
			role="tablist"
			class="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-zinc-900/70 bg-zinc-950/40 text-xs"
		>
			<Show
				when={props.values.length > 0}
				fallback={
					<p class="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
						{props.emptyLabel ?? 'Open a file to start editing'}
					</p>
				}
			>
				<For each={props.values}>
					{(value) => (
						<Tab
							value={value}
							label={labelFor(value)}
							isActive={value === props.activeValue}
							onSelect={props.onSelect}
							title={value}
						/>
					)}
				</For>
			</Show>
		</div>
	)
}
