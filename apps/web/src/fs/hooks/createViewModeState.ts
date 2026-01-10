import { createStore } from 'solid-js/store'
import { ReactiveSet } from '@solid-primitives/set'
import type { ViewMode } from '../types/TabIdentity'
import { getDefaultViewMode } from '../utils/viewModeDetection'

export const createViewModeState = () => {
	// Store only non-default view modes
	const [fileViewModes, setFileViewModes] = createStore<
		Record<string, ViewMode>
	>({})
	// Track which paths have custom view modes for efficient cleanup
	const pathsWithCustomModes = new ReactiveSet<string>()

	const setViewMode = (path: string, viewMode: ViewMode, stats?: any) => {
		const defaultMode = getDefaultViewMode(path, stats)

		console.log(
			'setViewMode called:',
			JSON.stringify({ path, viewMode, defaultMode }, null, 2)
		)

		if (viewMode === defaultMode) {
			// Remove from store if setting to default
			setFileViewModes(path, undefined!)
			pathsWithCustomModes.delete(path)
			console.log(
				'Removed view mode (set to default):',
				JSON.stringify({ path, viewMode }, null, 2)
			)
		} else {
			// Store non-default view mode
			setFileViewModes(path, viewMode)
			pathsWithCustomModes.add(path)
			console.log(
				'Stored custom view mode:',
				JSON.stringify({ path, viewMode }, null, 2)
			)
		}
	}

	const getViewMode = (path: string, stats?: any): ViewMode => {
		const stored = fileViewModes[path]
		if (stored) {
			console.log(
				'Retrieved stored view mode:',
				JSON.stringify({ path, stored }, null, 2)
			)
			return stored
		}

		// Return default view mode for the file
		const defaultMode = getDefaultViewMode(path, stats)
		console.log(
			'Using default view mode:',
			JSON.stringify({ path, defaultMode }, null, 2)
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
