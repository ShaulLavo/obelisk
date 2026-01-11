import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { ReactiveSet } from '@solid-primitives/set'
import type { ParseResult } from '@repo/utils'
import type { ViewMode } from '../types/ViewMode'
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
	// Version signal to force reactivity when view modes change
	const [viewModeVersion, setViewModeVersion] = createSignal(0)

	const setViewMode = (
		path: string,
		viewMode: ViewMode,
		stats?: ParseResult
	) => {
		const p = normalizePath(path)
		const defaultMode = getDefaultViewMode(p, stats)

		if (viewMode === defaultMode) {
			setFileViewModes(p, undefined!)
			pathsWithCustomModes.delete(p)
		} else {
			setFileViewModes(p, viewMode)
			pathsWithCustomModes.add(p)
		}
		// Increment version to trigger reactivity
		setViewModeVersion((v) => v + 1)
	}

	const getViewMode = (path: string, stats?: ParseResult): ViewMode => {
		// Read version to establish dependency
		void viewModeVersion()
		const p = normalizePath(path)
		const stored = fileViewModes[p]
		if (stored) {
			return stored
		}

		return getDefaultViewMode(p, stats)
	}

	const clearViewModes = () => {
		setFileViewModes({})
		pathsWithCustomModes.clear()
		setViewModeVersion((v) => v + 1)
	}

	return {
		fileViewModes,
		pathsWithCustomModes,
		viewModeVersion,
		setViewMode,
		getViewMode,
		clearViewModes,
	}
}
