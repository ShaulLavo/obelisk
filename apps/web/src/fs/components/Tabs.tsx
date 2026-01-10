import { Component, createSelector, For, Show, type JSX } from 'solid-js'
import { Tab } from './Tab'

export type TabsProps = {
	values: string[]
	activeValue?: string
	onSelect?: (value: string) => void
	onClose?: (value: string) => void
	getLabel?: (value: string) => string
	getTooltip?: (value: string) => string
	emptyLabel?: string
	dirtyPaths?: Record<string, boolean>
	rightSlot?: () => JSX.Element
}

export const Tabs: Component<TabsProps> = (props) => {
	const labelFor = (value: string) =>
		props.getLabel ? props.getLabel(value) : value

	const tooltipFor = (value: string) =>
		props.getTooltip ? props.getTooltip(value) : value

	const isSelected = createSelector(() => props.activeValue)

	return (
		<div
			role="tablist"
			class="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-border/30 bg-muted/40 text-xs"
		>
			<div class="flex items-end gap-1 flex-1 overflow-x-auto">
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
								isDirty={!!props.dirtyPaths?.[value]}
								onSelect={props.onSelect}
								onClose={props.onClose}
								title={tooltipFor(value)}
							/>
						)}
					</For>
				</Show>
			</div>
			<Show when={props.rightSlot}>{props.rightSlot!()}</Show>
		</div>
	)
}
