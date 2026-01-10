/**
 * Core types for tab identification with view modes
 */

export type ViewMode = 'editor' | 'ui' | 'binary'

export type TabIdentity = {
	path: string
	viewMode: ViewMode
}

/**
 * Creates a unique tab ID from a tab identity
 */
export const createTabId = (identity: TabIdentity): string => 
	`${identity.path}:${identity.viewMode}`

/**
 * Parses a tab ID back into a tab identity
 * Defaults to 'editor' mode for backward compatibility
 */
export const parseTabId = (tabId: string): TabIdentity => {
	const [path, viewMode = 'editor'] = tabId.split(':')
	return { 
		path: path!, 
		viewMode: viewMode as ViewMode 
	}
}

/**
 * Migrates existing tab state that doesn't include view mode information
 * Defaults to 'editor' mode for tabs without explicit view mode
 */
export const migrateTabState = (oldTabs: string[]): string[] => {
	return oldTabs.map(path => 
		path.includes(':') ? path : `${path}:editor`
	)
}