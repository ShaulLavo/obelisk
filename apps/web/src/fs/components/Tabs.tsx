import { Component, createSelector, For, Show } from 'solid-js'
import { Tab } from './Tab'

export type TabsProps = {
	values: string[]
	activeValue?: string
	onSelect?: (value: string) => void
	onClose?: (value: string) => void
	getLabel?: (value: string) => string
	emptyLabel?: string
}

export const Tabs: Component<TabsProps> = (props) => {
	const labelFor = (value: string) =>
		props.getLabel ? props.getLabel(value) : value

	const isSelected = createSelector(() => props.activeValue)

	return (
		<div
			role="tablist"
			class="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-border/30 bg-muted/40 text-xs"
		>
			<Show
				when={props.values.length > 0}
				fallback={
					<p class="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
						{props.emptyLabel ?? 'Open a file to start editing'}
					</p>
				}
			>
				<For each={props.values}>
					{(value) => (
						<Tab
							value={value}
							label={labelFor(value)}
							isActive={isSelected(value)}
							onSelect={props.onSelect}
							onClose={props.onClose}
							title={value}
						/>
					)}
				</For>
			</Show>
		</div>
	)
}
