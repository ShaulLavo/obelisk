import type { Component } from 'solid-js'
import { createEffect, createMemo, createSignal } from 'solid-js'
import {
	SettingsSearch,
	SettingsSidebar,
	SettingsPanel,
} from '@repo/ui/settings'
import { Resizable } from '../../components/Resizable'
import { useSettings } from '../SettingsProvider'

export type SettingsTabProps = {
	initialCategory?: string
	currentCategory?: string
	parentCategory?: string
	onCategoryChange?: (categoryId: string, parentCategoryId?: string) => void
}

export const SettingsTab: Component<SettingsTabProps> = (props) => {
	const [settingsState, settingsActions] = useSettings()

	// Search functionality (placeholder for now)
	const [searchValue, setSearchValue] = createSignal('')

	// Category selection state - use currentCategory prop if available, otherwise local state
	const [localSelectedCategory, setLocalSelectedCategory] = createSignal(
		props.initialCategory || 'editor'
	)
	// Track parent category when a subcategory is selected
	const [parentCategory, setParentCategory] = createSignal<string | undefined>(
		undefined
	)

	// Use currentCategory prop if provided, otherwise local state
	const selectedCategory = () => props.currentCategory || localSelectedCategory()

	// Find category info (handles both top-level and subcategories)
	const findCategoryInfo = (
		categoryId: string
	): { label: string; parentId?: string } | undefined => {
		for (const cat of settingsState.schema.categories) {
			if (cat.id === categoryId) {
				return { label: cat.label }
			}
			// Check subcategories
			if (cat.subcategories) {
				for (const sub of cat.subcategories) {
					if (sub.id === categoryId) {
						return { label: sub.label, parentId: cat.id }
					}
				}
			}
		}
		return undefined
	}

	const activeCategoryLabel = createMemo(() => {
		const info = findCategoryInfo(selectedCategory())
		return info?.label
	})

	const handleCategorySelect = (categoryId: string) => {
		const info = findCategoryInfo(categoryId)
		setLocalSelectedCategory(categoryId)
		setParentCategory(info?.parentId)
		// Notify parent of category change for URL sync
		props.onCategoryChange?.(categoryId, info?.parentId)
	}

	const handleSettingChange = (key: string, value: unknown) => {
		settingsActions.setSetting(key, value)
	}

	// Update parent category when selected category changes or from props
	createEffect(() => {
		const category = selectedCategory()
		
		if (props.parentCategory) {
			// If parent category is provided via props, use it
			setParentCategory(props.parentCategory)
		} else {
			// Otherwise derive from category info
			const info = findCategoryInfo(category)
			setParentCategory(info?.parentId)
		}
	})

	return (
		<div class="flex flex-col h-full min-h-0 bg-background">
			<div class="shrink-0 px-4 py-2 border-b border-border/60">
				<SettingsSearch
					value={searchValue()}
					onInput={setSearchValue}
					placeholder="Search settings"
				/>
			</div>
			<Resizable
				orientation="horizontal"
				storageKey="settings-horizontal-panel-size"
				defaultSizes={[0.24, 0.76]}
				minSize={0.12}
				class="flex flex-1 min-h-0"
				firstPanelClass="min-h-0 overflow-hidden bg-background"
				secondPanelClass="min-h-0 overflow-hidden bg-background"
				handleAriaLabel="Resize settings sidebar and panel"
			>
				<SettingsSidebar
					categories={settingsState.schema.categories}
					selectedCategory={selectedCategory()}
					onCategorySelect={handleCategorySelect}
				/>
				<SettingsPanel
					categoryId={selectedCategory()}
					categoryLabel={activeCategoryLabel()}
					parentCategoryId={parentCategory()}
					settings={settingsState.schema.settings}
					values={settingsState.values}
					onSettingChange={handleSettingChange}
				/>
			</Resizable>
		</div>
	)
}
