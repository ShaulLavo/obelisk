import type { ViewMode } from '../types/ViewMode'

/**
 * Creates a unique tab identity from file path and view mode
 * Requirements: 1.1, 1.2 - Unique tab identification
 */
export const createTabIdentity = (filePath: string, viewMode: ViewMode): string => {
	// Use pipe separator to create unique identity
	return `${filePath}|${viewMode}`
}

/**
 * Parses a tab identity back to file path and view mode
 * Requirements: 1.1, 1.2 - Reversible tab identification
 */
export const parseTabIdentity = (tabId: string): { filePath: string; viewMode: ViewMode } => {
	const lastPipeIndex = tabId.lastIndexOf('|')
	
	if (lastPipeIndex === -1) {
		return { filePath: tabId, viewMode: 'editor' }
	}
	
	const filePath = tabId.slice(0, lastPipeIndex)
	const viewMode = tabId.slice(lastPipeIndex + 1) as ViewMode
	
	return { filePath, viewMode }
}

/**
 * Gets display name for a tab based on file path and view mode
 * Requirements: 8.2, 8.4 - Tab visual distinction and tooltips
 */
export const getTabDisplayName = (filePath: string, viewMode: ViewMode): string => {
	const fileName = filePath.split('/').pop() || filePath
	
	if (viewMode === 'editor') {
		return fileName
	}
	
	// For non-editor modes, include mode in display name
	const modeLabel = viewMode.charAt(0).toUpperCase() + viewMode.slice(1)
	return `${fileName} (${modeLabel})`
}

/**
 * Checks if a tab ID represents a specific file and view mode combination
 */
export const isTabForFile = (tabId: string, filePath: string, viewMode?: ViewMode): boolean => {
	const parsed = parseTabIdentity(tabId)
	
	if (viewMode) {
		return parsed.filePath === filePath && parsed.viewMode === viewMode
	}
	
	return parsed.filePath === filePath
}

/**
 * Gets all tab IDs for a specific file across all view modes
 */
export const getTabsForFile = (tabIds: string[], filePath: string): string[] => {
	return tabIds.filter(tabId => isTabForFile(tabId, filePath))
}