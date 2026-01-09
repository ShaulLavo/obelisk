import { useSearchParams } from '@solidjs/router'

export const useSettingsRoute = () => {
	const [searchParams, setSearchParams] = useSearchParams()

	// Type-safe query state for settings category or view mode
	const settingsCategory = () => {
		const value = searchParams.settings
		return Array.isArray(value) ? value[0] || null : value || null
	}
	const viewMode = () => {
		const value = searchParams.view
		return Array.isArray(value) ? value[0] || null : value || null
	}

	const isSettingsOpen = () => settingsCategory() !== null

	const isJSONView = () => {
		// Check both ?settings=json and ?view=json patterns
		return settingsCategory() === 'json' || viewMode() === 'json'
	}

	const currentCategory = () => {
		const category = settingsCategory()
		if (!category || category === 'json') {
			return 'editor'
		}
		// If it's a hierarchical path like "editor/font", return just the subcategory
		if (category.includes('/')) {
			return category.split('/')[1] || 'editor'
		}
		return category
	}

	const currentParentCategory = () => {
		const category = settingsCategory()
		if (!category || category === 'json') {
			return undefined
		}
		// If it's a hierarchical path like "editor/font", return the parent category
		if (category.includes('/')) {
			return category.split('/')[0] || undefined
		}
		return undefined
	}

	const openSettings = (category?: string) => {
		// Clear view mode when opening regular settings
		setSearchParams({ settings: category || '', view: undefined })
	}

	const openJSONView = () => {
		// Use view=json parameter for JSON view
		setSearchParams({ settings: '', view: 'json' })
	}

	const closeSettings = () => {
		setSearchParams({ settings: undefined, view: undefined })
	}

	const navigateToCategory = (categoryId: string, parentCategoryId?: string) => {
		// Clear view mode when navigating to a category
		if (parentCategoryId) {
			// Hierarchical format: parent/subcategory
			setSearchParams({ settings: `${parentCategoryId}/${categoryId}`, view: undefined })
		} else {
			// Top-level category
			setSearchParams({ settings: categoryId, view: undefined })
		}
	}

	return {
		isSettingsOpen,
		isJSONView,
		currentCategory,
		currentParentCategory,
		openSettings,
		openJSONView,
		closeSettings,
		navigateToCategory,
	}
}