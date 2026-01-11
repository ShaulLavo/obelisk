import { Component, createSelector, For, Show, type JSX } from 'solid-js'
import { Tab } from './Tab'
import { Flex } from '@repo/ui/flex'
import type { ViewMode } from '../types/ViewMode'

export type TabsProps = {
	values: string[]
	activeValue?: string
	onSelect?: (value: string) => void
	onClose?: (value: string) => void
	getLabel?: (value: string) => string
	getTooltip?: (value: string) => string
	getViewMode?: (value: string) => ViewMode
	getAvailableViewModes?: (value: string) => ViewMode[]
	emptyLabel?: string
	dirtyPaths?: Record<string, boolean>
	rightSlot?: () => JSX.Element
}

export const Tabs: Component<TabsProps> = (props) => {
	const labelFor = (value: string) =>
		props.getLabel ? props.getLabel(value) : value

	const tooltipFor = (value: string) => {
		if (props.getTooltip) {
			const baseTooltip = props.getTooltip(value)
			const viewMode = props.getViewMode?.(value)
			const availableModes = props.getAvailableViewModes?.(value) || []

			// Enhanced tooltip with view mode information (Requirements 8.4)
			if (viewMode && availableModes.length > 1) {
				const viewModeLabel = getViewModeDisplayLabel(viewMode)
				return `${baseTooltip} (${viewModeLabel} mode)`
			}
			return baseTooltip
		}
		return value
	}

	const isSelected = createSelector(() => props.activeValue)

	return (
		<Flex
			role="tablist"
			alignItems="end"
			class="shrink-0 gap-1 overflow-x-auto border-b border-border/30 bg-muted/40 text-ui-xs"
		>
			<Flex alignItems="end" class="gap-1 flex-1 overflow-x-auto">
				<Show
					when={props.values.length > 0}
					fallback={
						<p class="uppercase tracking-[0.08em] text-muted-foreground px-2 py-1" style={{ "font-size": "calc(var(--ui-font-size, 13px) * 0.77)" }}>
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
								viewMode={props.getViewMode?.(value)}
								availableViewModes={props.getAvailableViewModes?.(value) || []}
							/>
						)}
					</For>
				</Show>
			</Flex>
			<Show when={props.rightSlot}>{props.rightSlot!()}</Show>
		</Flex>
	)
}

const getViewModeDisplayLabel = (viewMode: ViewMode): string => {
	switch (viewMode) {
		case 'editor':
			return 'Editor'
		case 'ui':
			return 'UI'
		case 'binary':
			return 'Binary'
		default:
			return viewMode
	}
}
