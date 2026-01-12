import { Accessor, createEffect, createSignal } from 'solid-js'

export type UseTabsOptions = {
	maxTabs?: number
	storageKey?: string
}

const DEFAULT_MAX_TABS = 10
const DEFAULT_STORAGE_KEY = 'fs-open-tabs'

const loadTabs = (key: string): string[] => {
	try {
		const stored = localStorage.getItem(key)
		if (stored) {
			const parsed = JSON.parse(stored)
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(item): item is string => typeof item === 'string'
				)
			}
		}
	} catch {
		// ignore
	}
	return []
}

const saveTabs = (key: string, tabs: string[]): void => {
	try {
		localStorage.setItem(key, JSON.stringify(tabs))
	} catch {
		// ignore
	}
}

const loadHistory = (key: string): string[] => {
	try {
		const stored = localStorage.getItem(key)
		if (stored) {
			const parsed = JSON.parse(stored)
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(item): item is string => typeof item === 'string'
				)
			}
		}
	} catch {
		// ignore
	}
	return []
}

const saveHistory = (key: string, history: string[]): void => {
	try {
		localStorage.setItem(key, JSON.stringify(history))
	} catch {
		// ignore
	}
}

export const useTabs = (
	activeTabId: Accessor<string | undefined>,
	options?: UseTabsOptions
) => {
	const maxTabs = options?.maxTabs ?? DEFAULT_MAX_TABS
	const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY
	const historyKey = `${storageKey}-history`

	const [tabs, setTabs] = createSignal<string[]>(loadTabs(storageKey))
	const [tabHistory, setTabHistory] = createSignal<string[]>(
		loadHistory(historyKey)
	)

	createEffect(() => {
		const tabId = activeTabId()
		if (!tabId) return

		setTabs((prev) => {
			if (prev.length > 0 && prev[prev.length - 1] === tabId) {
				return prev
			}
			if (prev.includes(tabId)) {
				return prev
			}
			const next = prev.length >= maxTabs ? prev.slice(1) : prev
			return [...next, tabId]
		})

		// Update tab history - move current tab to end (most recent)
		setTabHistory((prev) => {
			const filtered = prev.filter((id) => id !== tabId)
			return [...filtered, tabId]
		})
	})

	// Initialize history with existing tabs if history is empty but tabs exist
	createEffect(() => {
		const currentTabs = tabs()
		const currentHistory = tabHistory()

		if (currentTabs.length > 0 && currentHistory.length === 0) {
			setTabHistory(currentTabs)
		}
	})

	createEffect(() => {
		saveTabs(storageKey, tabs())
	})

	createEffect(() => {
		saveHistory(historyKey, tabHistory())
	})

	const closeTab = (tabId: string) => {
		setTabs((prev) => prev.filter((tab) => tab !== tabId))

		setTabHistory((prev) => {
			const currentTabs = tabs().filter((tab) => tab !== tabId)
			const recentHistory = prev.slice(-20)

			return recentHistory.filter(
				(historyTabId) =>
					currentTabs.includes(historyTabId) ||
					prev.indexOf(historyTabId) >= prev.length - 5
			)
		})
	}

	const getPreviousTab = (closingTabId: string): string | undefined => {
		const currentTabs = tabs()
		const history = tabHistory()

		// Find the most recent tab in history that's still open and not the one being closed
		for (let i = history.length - 1; i >= 0; i--) {
			const historyTabId = history[i]
			if (
				historyTabId &&
				historyTabId !== closingTabId &&
				currentTabs.includes(historyTabId)
			) {
				return historyTabId
			}
		}

		// Fallback: try adjacent tabs
		const currentIndex = currentTabs.indexOf(closingTabId)
		if (currentIndex !== -1) {
			if (currentIndex > 0) {
				return currentTabs[currentIndex - 1]
			}
			if (currentIndex < currentTabs.length - 1) {
				return currentTabs[currentIndex + 1]
			}
		}

		// Fallback: return the last tab that's not the closing one
		const remainingTabs = currentTabs.filter((tab) => tab !== closingTabId)
		return remainingTabs.length > 0
			? remainingTabs[remainingTabs.length - 1]
			: undefined
	}

	return [tabs, { closeTab, getPreviousTab }] as const
}
