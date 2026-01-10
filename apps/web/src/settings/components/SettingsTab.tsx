import type { Component } from 'solid-js'
import { createMemo, createSignal } from 'solid-js'
import {
	SettingsSearch,
	SettingsSidebar,
	SettingsPanel,
} from '@repo/ui/settings'
import type { SettingsCategory } from '@repo/ui/settings'
import { Resizable } from '../../components/Resizable'
import { useSettings } from '../SettingsProvider'
import { FontsSubcategoryUI } from '../fonts/components/FontsSubcategoryUI'
import { FontFamilySelect } from './FontFamilySelect'
import { FontCategory } from '../../fonts'
import { Flex } from '@repo/ui/flex'
export type SettingsTabProps = {
	initialCategory?: string
	currentCategory?: string
	parentCategory?: string
	onCategoryChange?: (categoryId: string, parentCategoryId?: string) => void
}

export const SettingsTab: Component<SettingsTabProps> = (props) => {
	const [settingsState, settingsActions] = useSettings()

	const [searchValue, setSearchValue] = createSignal('')

	const [localSelectedCategory, setLocalSelectedCategory] = createSignal(
		props.initialCategory || 'editor'
	)

	const selectedCategory = () =>
		props.currentCategory || localSelectedCategory()

	const findCategory = (
		id: string,
		categories: SettingsCategory[] = settingsState.schemas
	):
		| { category: SettingsCategory; parent?: SettingsCategory; path: string }
		| undefined => {
		for (const cat of categories) {
			if (cat.id === id) {
				return { category: cat, path: cat.id }
			}
			if (cat.children) {
				for (const child of cat.children) {
					if (child.id === id) {
						return {
							category: child,
							parent: cat,
							path: `${cat.id}.${child.id}`,
						}
					}
					const found = findCategory(id, cat.children)
					if (found) {
						return { ...found, path: `${cat.id}.${found.path}` }
					}
				}
			}
		}
		return undefined
	}

	const parseCategoryPath = (
		categoryId: string
	): { id: string; parentId?: string } => {
		const segments = categoryId.split('/').filter(Boolean)
		if (segments.length < 2) {
			return { id: categoryId }
		}
		return {
			id: segments[segments.length - 1] ?? categoryId,
			parentId: segments[0],
		}
	}

	const activeCategory = createMemo(() => {
		const parsed = parseCategoryPath(selectedCategory())
		return findCategory(parsed.id)
	})

	const handleCategorySelect = (categoryId: string) => {
		const parsed = parseCategoryPath(categoryId)
		const info = findCategory(parsed.id)

		setLocalSelectedCategory(categoryId)
		props.onCategoryChange?.(categoryId, info?.parent?.id)
	}

	const handleSettingChange = (key: string, value: unknown) => {
		settingsActions.setSetting(key, value)
	}

	const customSubcategoryComponents = {
		fonts: () => <FontsSubcategoryUI />,
	}

	const customSettingComponents = {
		'editor.font.family': () => (
			<FontFamilySelect
				value={String(
					settingsState.values['editor.font.family'] ||
						"'JetBrains Mono Variable', monospace"
				)}
				onChange={(value) => handleSettingChange('editor.font.family', value)}
				label="Font Family"
				description="Controls the font family."
				category={FontCategory.MONO}
			/>
		),
		'terminal.font.family': () => (
			<FontFamilySelect
				value={String(
					settingsState.values['terminal.font.family'] ||
						"'JetBrains Mono Variable', monospace"
				)}
				onChange={(value) => handleSettingChange('terminal.font.family', value)}
				label="Font Family"
				description="Controls the font family in the terminal."
				category={FontCategory.MONO}
			/>
		),
		'ui.font.family': () => (
			<FontFamilySelect
				value={String(
					settingsState.values['ui.font.family'] ||
						"'Google Sans Flex', sans-serif"
				)}
				onChange={(value) => handleSettingChange('ui.font.family', value)}
				label="Font Family"
				description="Controls the font family for the entire user interface."
			/>
		),
	}

	const sidebarCategories = () => settingsState.schemas

	return (
		<Flex
			flexDirection="col"
			class="h-full min-h-0 bg-background"
			alignItems="stretch"
		>
			<div class="shrink-0 px-2 py-2 border-b border-border/60">
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
					categories={sidebarCategories()}
					selectedCategory={selectedCategory()}
					onCategorySelect={handleCategorySelect}
				/>
				{activeCategory() && (
					<SettingsPanel
						category={activeCategory()!.category}
						categoryPath={activeCategory()!.path}
						values={settingsState.values}
						onSettingChange={handleSettingChange}
						customSubcategoryComponents={customSubcategoryComponents}
						customSettingComponents={customSettingComponents}
					/>
				)}
			</Resizable>
		</Flex>
	)
}
