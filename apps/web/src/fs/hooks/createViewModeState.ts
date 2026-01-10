import { createStore } from 'solid-js/store'
import { ReactiveSet } from '@solid-primitives/set'
import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/TabIdentity'
import { getDefaultViewMode } from '../utils/viewModeDetection'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createViewModeState = () => {
	// Store only non-default view modes
	const [fileViewModes, setFileViewModes] = createStore<
		Record<string, ViewMode>
	>({})
	// Track which paths have custom view modes for efficient cleanup
	const pathsWithCustomModes = new ReactiveSet<string>()

	const setViewMode = (path: string, viewMode: ViewMode, stats?: ParseResult) => {
		const p = normalizePath(path)
		const defaultMode = getDefaultViewMode(p, stats)

		console.log(
			'setViewMode called:',
			JSON.stringify({ path: p, viewMode, defaultMode }, null, 2)
		)

		if (viewMode === defaultMode) {
			// Remove from store if setting to default
			setFileViewModes(p, undefined!)
			pathsWithCustomModes.delete(p)
			console.log(
				'Removed view mode (set to default):',
				JSON.stringify({ path: p, viewMode }, null, 2)
			)
		} else {
			// Store non-default view mode
			setFileViewModes(p, viewMode)
			pathsWithCustomModes.add(p)
			console.log(
				'Stored custom view mode:',
				JSON.stringify({ path: p, viewMode }, null, 2)
			)
		}
	}

	const getViewMode = (path: string, stats?: ParseResult): ViewMode => {
		const p = normalizePath(path)
		const stored = fileViewModes[p]
		if (stored) {
			console.log(
				'Retrieved stored view mode:',
				JSON.stringify({ path: p, stored }, null, 2)
			)
			return stored
		}

		// Return default view mode for the file
		const defaultMode = getDefaultViewMode(p, stats)
		console.log(
			'Using default view mode:',
			JSON.stringify({ path: p, defaultMode }, null, 2)
		)
		return defaultMode
	}

	const clearViewModes = () => {
		setFileViewModes({})
		pathsWithCustomModes.clear()
	}

	return {
		fileViewModes,
		pathsWithCustomModes,
		setViewMode,
		getViewMode,
		clearViewModes,
	}
}
