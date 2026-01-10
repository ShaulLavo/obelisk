/**
 * View mode types for files
 * View mode is stored separately from tab identity - tabs are just file paths
 */

export type ViewMode = 'editor' | 'ui' | 'binary'

/**
 * Cleans up legacy tab IDs that had :viewMode suffix
 * Now tabs are just file paths
 */
export const cleanLegacyTabId = (tabId: string): string => {
	// Remove any :editor, :ui, :binary suffix from old tab format
	if (tabId.includes(':')) {
		const colonIndex = tabId.lastIndexOf(':')
		const suffix = tabId.slice(colonIndex + 1)
		if (suffix === 'editor' || suffix === 'ui' || suffix === 'binary') {
			return tabId.slice(0, colonIndex)
		}
	}
	return tabId
}

/**
 * Migrates existing tab state to remove view mode suffixes
 * Tabs are now just file paths
 */
export const migrateTabState = (oldTabs: string[]): string[] => {
	const cleaned = oldTabs.map(cleanLegacyTabId)
	// Remove duplicates that might result from migration
	return [...new Set(cleaned)]
}
