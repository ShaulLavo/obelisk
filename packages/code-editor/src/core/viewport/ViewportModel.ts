/**
 * ViewportModel — framework-free viewport state.
 *
 * Tracks scroll position and viewport dimensions.
 * Non-undoable, non-transactional.
 */

import type { ViewportState } from '../types'

export const createViewportState = (): ViewportState => ({
	scrollTop: 0,
	scrollLeft: 0,
	viewportWidth: 0,
	viewportHeight: 0,
})

export const updateViewportState = (
	current: ViewportState,
	input: Partial<ViewportState>
): ViewportState => ({
	scrollTop: input.scrollTop ?? current.scrollTop,
	scrollLeft: input.scrollLeft ?? current.scrollLeft,
	viewportWidth: input.viewportWidth ?? current.viewportWidth,
	viewportHeight: input.viewportHeight ?? current.viewportHeight,
})

export const hasViewportChanged = (
	a: ViewportState,
	b: ViewportState
): boolean =>
	a.scrollTop !== b.scrollTop ||
	a.scrollLeft !== b.scrollLeft ||
	a.viewportWidth !== b.viewportWidth ||
	a.viewportHeight !== b.viewportHeight
