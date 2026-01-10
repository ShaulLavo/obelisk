import type { Component, JSX } from 'solid-js'
import { For, Show, createMemo } from 'solid-js'
import { SettingItem } from './SettingItem'
import type { SettingDefinition } from './SettingItem'
import { SettingsScrollArea } from './SettingsScrollArea'
import { cn } from '../utils'
import type { SettingsCategory } from './SettingsSidebarItem'

export type SettingsPanelProps = {
	category: SettingsCategory
	categoryPath: string
	values: Record<string, unknown>
	onSettingChange: (key: string, value: unknown) => void
	class?: string
	customSubcategoryComponents?: Record<string, () => JSX.Element>
	customSettingComponents?: Record<string, () => JSX.Element>
}

export const SettingsPanel: Component<SettingsPanelProps> = (props) => {
	// Convert category settings to SettingDefinition format with full key
	const categorySettings = createMemo(() => {
		if (!props.category.settings) return []
		return props.category.settings.map((setting) => ({
			...setting,
			key: `${props.categoryPath}.${setting.id}`,
		}))
	})

	// Check if we should show custom UI for this category
	const customComponent = () =>
		props.customSubcategoryComponents?.[props.category.id]

	return (
		<SettingsScrollArea
			class={cn('h-full min-h-0 bg-background', props.class)}
			contentClass="px-4 py-3 pr-6"
		>
			{/* Category header */}
			<div class="mb-3 border border-border/60 bg-muted/40 px-3 py-1.5">
				<h1 class="text-xl font-semibold text-foreground">
					{props.category.label}
				</h1>
			</div>

			{/* Settings */}
			<div class="space-y-5">
				{/* Custom component if available */}
				<Show when={customComponent()}>{customComponent()!()}</Show>

				{/* Regular settings */}
				<Show when={categorySettings().length > 0}>
					<div class="divide-y divide-border/60">
						<For each={categorySettings()}>
							{(setting) => (
								<SettingItem
									setting={setting}
									value={props.values[setting.key]}
									onChange={(value) =>
										props.onSettingChange(setting.key, value)
									}
									customComponents={props.customSettingComponents}
								/>
							)}
						</For>
					</div>
				</Show>

				{/* Nested children */}
				<For each={props.category.children || []}>
					{(child) => (
						<div class="space-y-3">
							<h2 class="text-sm font-semibold text-foreground/80 capitalize border-b border-border/60 pb-1.5">
								{child.label}
							</h2>

							{/* Check for custom component for this child */}
							<Show
								when={props.customSubcategoryComponents?.[child.id]}
								fallback={
									<div class="divide-y divide-border/60">
										<For each={child.settings || []}>
											{(setting) => {
												const key = `${props.categoryPath}.${child.id}.${setting.id}`
												return (
													<SettingItem
														setting={{ ...setting, key }}
														value={props.values[key]}
														onChange={(value) =>
															props.onSettingChange(key, value)
														}
														customComponents={props.customSettingComponents}
													/>
												)
											}}
										</For>
									</div>
								}
							>
								{props.customSubcategoryComponents![child.id]()}
							</Show>
						</div>
					)}
				</For>
			</div>

			{/* Empty state */}
			<Show
				when={
					categorySettings().length === 0 &&
					!props.category.children?.length &&
					!customComponent()
				}
			>
				<div class="flex items-center justify-center h-64 text-center">
					<div class="space-y-2">
						<p class="text-base font-medium text-muted-foreground">
							No settings found
						</p>
						<p class="text-sm text-muted-foreground">
							There are no settings available for the "{props.category.id}"
							category.
						</p>
					</div>
				</div>
			</Show>
		</SettingsScrollArea>
	)
}
