import type { FileCacheEntry } from './fileCacheController'

/**
 * Manages state for the currently active file.
 * This state is never evicted and bypasses DISABLE_CACHE.
 * 
 * The active file is the file currently being edited in the editor.
 * Its state is kept separate from the regular cache to ensure it's
 * always available regardless of cache settings or eviction policies.
 */
export interface ActiveFileState {
	/** Current active file path, or null if none */
	activePath: string | null
	
	/** Set the active file path */
	setActive(path: string | null): void
	
	/** Get active file's cache entry (always available) */
	getActiveEntry(): FileCacheEntry | null
	
	/** Update active file's cache entry */
	setActiveEntry(entry: Partial<FileCacheEntry>): void
	
	/** Replace active file's cache entry entirely */
	replaceActiveEntry(entry: FileCacheEntry): void
	
	/** Check if a path is the active file */
	isActive(path: string): boolean
}

/**
 * Options for configuring ActiveFileState behavior.
 */
export interface ActiveFileStateOptions {
	/** Callback when active file changes */
	onActiveChange?: (oldPath: string | null, newPath: string | null) => void
	/** Callback when active file becomes inactive (for cache transition) */
	onDeactivate?: (path: string, entry: FileCacheEntry) => void
}

/**
 * Creates an ActiveFileState instance that manages the currently active file's state.
 * 
 * The active file state is kept separate from the cache to ensure:
 * - It's never evicted from memory
 * - It bypasses DISABLE_CACHE setting
 * - It's always instantly available for editor operations
 */
export function createActiveFileState(options: ActiveFileStateOptions = {}): ActiveFileState {
	let activePath: string | null = null
	let activeEntry: FileCacheEntry = {}

	const setActive = (path: string | null): void => {
		const oldPath = activePath
		
		// If we're deactivating a file, trigger the callback for cache transition
		if (oldPath && oldPath !== path && options.onDeactivate) {
			options.onDeactivate(oldPath, { ...activeEntry })
		}

		// Clear active entry when changing files
		if (oldPath !== path) {
			activeEntry = {}
		}

		activePath = path
		
		// Notify about active file change
		if (options.onActiveChange) {
			options.onActiveChange(oldPath, path)
		}
	}

	const getActiveEntry = (): FileCacheEntry | null => {
		if (!activePath) {
			return null
		}
		return { ...activeEntry }
	}

	const setActiveEntry = (entry: Partial<FileCacheEntry>): void => {
		if (!activePath) {
			return // No active file to update
		}

		// Merge the partial entry with existing active entry
		activeEntry = {
			...activeEntry,
			...entry
		}
	}

	const replaceActiveEntry = (entry: FileCacheEntry): void => {
		if (!activePath) {
			return // No active file to update
		}

		// Replace the entire entry
		activeEntry = { ...entry }
	}

	const isActive = (path: string): boolean => {
		return activePath === path
	}

	return {
		get activePath() {
			return activePath
		},
		setActive,
		getActiveEntry,
		setActiveEntry,
		replaceActiveEntry,
		isActive
	}
}

/**
 * Utility function to update a specific field in the active file entry.
 */
export function updateActiveFileField<K extends keyof FileCacheEntry>(
	activeState: ActiveFileState,
	field: K,
	value: FileCacheEntry[K]
): void {
	if (!activeState.activePath) {
		return
	}

	activeState.setActiveEntry({ [field]: value } as Partial<FileCacheEntry>)
}

/**
 * Utility function to get a specific field from the active file entry.
 */
export function getActiveFileField<K extends keyof FileCacheEntry>(
	activeState: ActiveFileState,
	field: K
): FileCacheEntry[K] | undefined {
	const entry = activeState.getActiveEntry()
	return entry?.[field]
}

/**
 * Utility function to clear a specific field from the active file entry.
 */
export function clearActiveFileField<K extends keyof FileCacheEntry>(
	activeState: ActiveFileState,
	field: K
): void {
	if (!activeState.activePath) {
		return
	}

	const entry = activeState.getActiveEntry()
	if (entry && field in entry) {
		const updatedEntry = { ...entry }
		delete updatedEntry[field]
		// Replace the entire entry with the updated one
		activeState.replaceActiveEntry(updatedEntry)
	}
}