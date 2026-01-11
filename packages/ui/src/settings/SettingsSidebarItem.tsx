import type { Component } from 'solid-js'
import { For, Show, createEffect, createSelector, createSignal } from 'solid-js'
import * as Accordion from '@corvu/accordion'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'
import { VsTextSize } from '@repo/icons/vs/VsTextSize'
import { cn } from '../utils'
import { Button } from '../button'

// Icon mapping for category icons
const iconMap = {
	VsTextSize: VsTextSize,
} as const

type IconName = keyof typeof iconMap

export type SettingSetting = {
	id: string
	default: unknown
	description?: string
	options?: string[] | { value: string; label: string }[]
	experimental?: boolean
	icon?: string
}

export type SettingsCategory = {
	id: string
	label: string
	icon?: string
	settings?: SettingSetting[]
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

	const selectedCategory = () => props.selectedCategory
	const isSelectedKey = createSelector(selectedCategory)
	const isSelected = () => isSelectedKey(fullId())

	const isParentOfSelected = () =>
		selectedCategory().startsWith(`${fullId()}/`)

	const hasChildren = () => Boolean(props.category.children?.length)

	const renderIcon = () => {
		if (!props.category.icon) return null
		const IconComponent = iconMap[props.category.icon as IconName]
		return IconComponent ? (
			<IconComponent class="h-4 w-4 text-muted-foreground" />
		) : null
	}

	const [expandedItems, setExpandedItems] = createSignal<string[]>(
		isSelected() || isParentOfSelected() ? [props.category.id] : []
	)

	const isExpanded = () => expandedItems().includes(props.category.id)

	const handleExpandedChange = (value: string[] | string | null) => {
		if (Array.isArray(value)) {
			setExpandedItems(value)
			return
		}
		if (value) {
			setExpandedItems([value])
			return
		}
		setExpandedItems([])
	}

	const handleTriggerClick = () => {
		if (isExpanded()) return
		const nextId = fullId()
		if (selectedCategory() === nextId) return
		queueMicrotask(() => props.onCategorySelect(nextId))
	}

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
			'group flex w-full items-center justify-between gap-2 text-left text-ui',
			'h-auto py-1 pr-2.5',
			'border-l-2 border-transparent rounded-none',
			'transition-colors',
			'text-foreground/80 hover:bg-muted/50 hover:text-foreground',
			isSelected() &&
				'border-foreground/40 bg-muted/60 text-foreground font-semibold',
			level() > 0 ? 'pl-5' : 'pl-2.5'
		)

	return (
		<Show
			when={hasChildren()}
			fallback={
				<Button
					onClick={() => props.onCategorySelect(fullId())}
					variant="ghost"
					class={itemClass()}
				>
					<div class="flex items-center gap-2">
						{renderIcon()}
						<span class="truncate">{props.category.label}</span>
					</div>
				</Button>
			}
		>
			<Accordion.Root
				multiple={true}
				value={expandedItems()}
				onValueChange={handleExpandedChange}
			>
				<Accordion.Item value={props.category.id}>
					<Accordion.Trigger
						class={cn(
							itemClass(),
							'data-[expanded]:[&_[data-accordion-toggle=true]_svg]:rotate-90'
						)}
						onClick={handleTriggerClick}
					>
						<div class="flex items-center gap-2">
							{renderIcon()}
							<span class="truncate">{props.category.label}</span>
						</div>
						<span class="flex items-center" data-accordion-toggle="true">
							<VsChevronRight class="h-3.5 w-3.5 text-muted-foreground transition-transform" />
						</span>
					</Accordion.Trigger>
					<Accordion.Content class="overflow-hidden data-[expanded]:animate-accordion-down data-[collapsed]:animate-accordion-up">
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
