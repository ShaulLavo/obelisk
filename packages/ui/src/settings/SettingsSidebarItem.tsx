import type { Component } from 'solid-js'
import { For, Show, createSignal, createEffect } from 'solid-js'
import * as Accordion from '@corvu/accordion'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'
import { VsTextSize } from '@repo/icons/vs/VsTextSize'
import { cn } from '../utils'

// Icon mapping for category icons
const iconMap = {
	VsTextSize: VsTextSize,
} as const

type IconName = keyof typeof iconMap

export type SettingsCategory = {
	id: string
	label: string
	icon?: string
	children?: SettingsCategory[]
}

export type SettingsSidebarItemProps = {
	category: SettingsCategory
	level?: number
	selectedCategory: string
	onCategorySelect: (categoryId: string) => void
	parentId?: string
}

export const SettingsSidebarItem: Component<SettingsSidebarItemProps> = (
	props
) => {
	const level = () => props.level ?? 0

	const fullId = () =>
		props.parentId
			? `${props.parentId}/${props.category.id}`
			: props.category.id

	// Selected ONLY if exact match
	const isSelected = () => props.selectedCategory === fullId()

	// Check if this item contains the selected category (for expansion)
	const isParentOfSelected = () =>
		props.selectedCategory.startsWith(`${fullId()}/`)

	const hasChildren = () => Boolean(props.category.children?.length)

	// Render icon if provided
	const renderIcon = () => {
		if (!props.category.icon) return null
		const IconComponent = iconMap[props.category.icon as IconName]
		return IconComponent ? (
			<IconComponent class="h-4 w-4 text-muted-foreground" />
		) : null
	}

	// Controlled expansion state
	const [expandedItems, setExpandedItems] = createSignal<string[]>(
		isSelected() || isParentOfSelected() ? [props.category.id] : []
	)

	// Keep expanded state in sync with selection
	createEffect(() => {
		if (isSelected() || isParentOfSelected()) {
			setExpandedItems((prev) => {
				if (prev.includes(props.category.id)) return prev
				return [...prev, props.category.id]
			})
		}
	})

	const itemClass = () =>
		cn(
			'group flex w-full items-center justify-between gap-2 text-left text-sm',
			'py-1 pr-2.5',
			'border-l-2 border-transparent',
			'transition-colors',
			'text-foreground/80 hover:bg-muted/50 hover:text-foreground',
			// Only highlight the exact selected item due to user request
			isSelected() &&
				'border-foreground/40 bg-muted/60 text-foreground font-semibold',
			level() > 0 ? 'pl-5' : 'pl-2.5'
		)

	return (
		<Show
			when={hasChildren()}
			fallback={
				<button
					type="button"
					onClick={() => props.onCategorySelect(fullId())}
					class={itemClass()}
				>
					<div class="flex items-center gap-2">
						{renderIcon()}
						<span class="truncate">{props.category.label}</span>
					</div>
				</button>
			}
		>
			<Accordion.Root
				multiple={true}
				value={expandedItems()}
				onValueChange={setExpandedItems}
			>
				<Accordion.Item value={props.category.id}>
					<Accordion.Trigger
						class={cn(itemClass(), '[&[data-expanded]>svg]:rotate-90')}
						onClick={() => props.onCategorySelect(fullId())}
					>
						<div class="flex items-center gap-2">
							{renderIcon()}
							<span class="truncate">{props.category.label}</span>
						</div>
						<VsChevronRight class="h-3.5 w-3.5 text-muted-foreground transition-transform" />
					</Accordion.Trigger>
					<Accordion.Content class="overflow-hidden data-[expanded]:animate-accordion-down data-[closed]:animate-accordion-up">
						<div class="space-y-1 pt-1">
							<For each={props.category.children || []}>
								{(subcategory) => (
									<SettingsSidebarItem
										category={subcategory}
										level={level() + 1}
										selectedCategory={props.selectedCategory}
										onCategorySelect={props.onCategorySelect}
										parentId={fullId()}
									/>
								)}
							</For>
						</div>
					</Accordion.Content>
				</Accordion.Item>
			</Accordion.Root>
		</Show>
	)
}
