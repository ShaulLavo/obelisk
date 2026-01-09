import { Accessor, createEffect, createSignal } from 'solid-js'

export type UseTabsOptions = {
	maxTabs?: number
	storageKey?: string
}

const DEFAULT_MAX_TABS = 10
const DEFAULT_STORAGE_KEY = 'fs-open-tabs'
const DEFAULT_HISTORY_KEY = 'fs-tab-history'

const loadTabs = (key: string): string[] => {
	try {
		const stored = localStorage.getItem(key)
		if (stored) {
			const parsed = JSON.parse(stored)
			if (Array.isArray(parsed)) {
				return parsed.filter((item): item is string => typeof item === 'string')
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
				return parsed.filter((item): item is string => typeof item === 'string')
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
	activePath: Accessor<string | undefined>,
	options?: UseTabsOptions
) => {
	const maxTabs = options?.maxTabs ?? DEFAULT_MAX_TABS
	const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY
	const historyKey = `${storageKey}-history`
	
	const [tabs, setTabs] = createSignal<string[]>(loadTabs(storageKey))
	const [tabHistory, setTabHistory] = createSignal<string[]>(loadHistory(historyKey))

	createEffect(() => {
		const path = activePath()
		if (!path) return
		
		setTabs((prev) => {
			if (prev.length > 0 && prev[prev.length - 1] === path) {
				return prev
			}
			if (prev.includes(path)) {
				return prev
			}
			const next = prev.length >= maxTabs ? prev.slice(1) : prev
			return [...next, path]
		})

		// Update tab history - move current tab to end (most recent)
		setTabHistory((prev) => {
			const filtered = prev.filter((p) => p !== path)
			return [...filtered, path]
		})
	})

	// Initialize history with existing tabs if history is empty but tabs exist
	createEffect(() => {
		const currentTabs = tabs()
		const currentHistory = tabHistory()
		
		if (currentTabs.length > 0 && currentHistory.length === 0) {
			// Initialize history with current tabs order
			setTabHistory(currentTabs)
		}
	})

	createEffect(() => {
		saveTabs(storageKey, tabs())
	})

	createEffect(() => {
		saveHistory(historyKey, tabHistory())
	})

	const closeTab = (path: string) => {
		setTabs((prev) => prev.filter((tab) => tab !== path))
		
		// Clean up history - remove tabs that are no longer open
		// Keep some history for recently closed tabs, but limit it
		setTabHistory((prev) => {
			const currentTabs = tabs().filter(tab => tab !== path) // tabs after closing
			const recentHistory = prev.slice(-20) // Keep last 20 for memory
			
			// Keep tabs that are still open + some recent closed ones
			return recentHistory.filter(historyPath => 
				currentTabs.includes(historyPath) || 
				prev.indexOf(historyPath) >= prev.length - 5 // Keep last 5 closed tabs
			)
		})
	}

	const getPreviousTab = (closingPath: string): string | undefined => {
		const currentTabs = tabs()
		const history = tabHistory()
		
		// First, try to find the most recent tab in history that's still open and not the one being closed
		for (let i = history.length - 1; i >= 0; i--) {
			const historyPath = history[i]
			if (historyPath && historyPath !== closingPath && currentTabs.includes(historyPath)) {
				return historyPath
			}
		}
		
		// Fallback 1: If no history or history doesn't help, try adjacent tabs
		const currentIndex = currentTabs.indexOf(closingPath)
		if (currentIndex !== -1) {
			// Try tab to the left first (more natural)
			if (currentIndex > 0) {
				return currentTabs[currentIndex - 1]
			}
			// Then try tab to the right
			if (currentIndex < currentTabs.length - 1) {
				return currentTabs[currentIndex + 1]
			}
		}
		
		// Fallback 2: If all else fails, return the last tab that's not the closing one
		const remainingTabs = currentTabs.filter(tab => tab !== closingPath)
		if (remainingTabs.length > 0) {
			return remainingTabs[remainingTabs.length - 1]
		}
		
		return undefined
	}

	return [tabs, { closeTab, getPreviousTab }] as const
}
