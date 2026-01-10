import { createMemo, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'

const USER_SETTINGS_FILE_PATH = '.system/userSettings.json'

// Normalize path by stripping leading slash
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

type UseSettingsViewStateParams = {
	selectedPath: Accessor<string | undefined>
}

// Simple local state for view mode (editor vs UI)
const [currentCategory, setCurrentCategory] = createSignal<string>('editor')
const [isJsonView, setIsJsonView] = createSignal(true)

// Export direct setters for command palette usage
export const setSettingsJsonView = () => setIsJsonView(true)
export const setSettingsUIView = () => setIsJsonView(false)

export const useSettingsViewState = (params: UseSettingsViewStateParams) => {
	const isSettingsFile = createMemo(() => {
		const path = params.selectedPath()
		return path ? normalizePath(path) === USER_SETTINGS_FILE_PATH : false
	})
	const shouldShowJSONView = createMemo(() => isJsonView())

	const handleCategoryChange = (categoryId: string) => {
		setCurrentCategory(categoryId)
	}

	const openJSONView = () => {
		setIsJsonView(true)
	}

	const openUIView = () => {
		setIsJsonView(false)
	}

	return {
		isSettingsFile,
		shouldShowJSONView,
		handleCategoryChange,
		currentCategory,
		openJSONView,
		openUIView,
	}
}
