/**
 * Selection math — pure functions for selection manipulation.
 * Framework-free, no DOM or Solid dependencies.
 */

import type { SelectionRange } from '../types'

export const createCollapsedSelection = (offset: number): SelectionRange => ({
	anchor: offset,
	focus: offset,
})

export const createSelection = (
	anchor: number,
	focus: number
): SelectionRange => ({ anchor, focus })

export const isCollapsed = (sel: SelectionRange): boolean =>
	sel.anchor === sel.focus

export const getSelectionBounds = (
	sel: SelectionRange
): { start: number; end: number } => ({
	start: Math.min(sel.anchor, sel.focus),
	end: Math.max(sel.anchor, sel.focus),
})

export const getSelectionLength = (sel: SelectionRange): number =>
	Math.abs(sel.focus - sel.anchor)

/**
 * Clamp a selection to valid document bounds.
 */
export const clampSelection = (
	sel: SelectionRange,
	docLength: number
): SelectionRange => {
	const maxOffset = Math.max(0, docLength)
	return {
		anchor: Math.max(0, Math.min(sel.anchor, maxOffset)),
		focus: Math.max(0, Math.min(sel.focus, maxOffset)),
	}
}

/**
 * Collapse the selection to the cursor position (focus).
 */
export const collapseSelection = (sel: SelectionRange): SelectionRange =>
	createCollapsedSelection(sel.focus)

/**
 * Collapse to the start or end of the selection based on movement direction.
 */
export const collapseToDirection = (
	sel: SelectionRange,
	direction: 'left' | 'right' | 'up' | 'down'
): SelectionRange => {
	const bounds = getSelectionBounds(sel)
	if (direction === 'left' || direction === 'up') {
		return createCollapsedSelection(bounds.start)
	}
	return createCollapsedSelection(bounds.end)
}

/**
 * Extend selection to a new focus offset, keeping the anchor.
 */
export const extendSelection = (
	sel: SelectionRange,
	newFocus: number
): SelectionRange => ({
	anchor: sel.anchor,
	focus: newFocus,
})

/**
 * Select the entire document.
 */
export const selectAll = (docLength: number): SelectionRange => ({
	anchor: 0,
	focus: docLength,
})
