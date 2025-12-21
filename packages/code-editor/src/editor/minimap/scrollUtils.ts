/**
 * Scroll utility functions for minimap scroll synchronization.
 * These are used by both the main component and overlay rendering.
 */

import { MINIMAP_ROW_HEIGHT_CSS, MINIMAP_SLIDER_HEIGHT_CSS } from './constants'

export type MinimapScrollState = {
	/** How far the minimap content is scrolled (CSS pixels) */
	minimapScrollTop: number
	/** Slider Y position (CSS pixels) */
	sliderTop: number
	/** Slider height (CSS pixels) */
	sliderHeight: number
}

/**
 * Calculate minimap scroll state from editor scroll position.
 * Accounts for editor's overscroll padding (50% of viewport).
 *
 * @param element - The scroll container element (editor)
 * @param minimapHeight - Visible height of the minimap container (CSS pixels)
 * @param totalMinimapHeight - Total height of all minimap content (CSS pixels)
 */
export const getMinimapScrollState = (
	element: HTMLElement,
	minimapHeight: number,
	totalMinimapHeight: number
): MinimapScrollState => {
	const scrollHeight = element.scrollHeight
	const clientHeight = element.clientHeight
	const scrollTop = element.scrollTop

	// Use fixed slider height for consistent appearance
	const sliderHeight = MINIMAP_SLIDER_HEIGHT_CSS

	// If editor content fits, no scroll needed
	if (scrollHeight <= clientHeight) {
		return { minimapScrollTop: 0, sliderTop: 0, sliderHeight }
	}

	// Use the FULL scroll range including overscroll padding.
	// This way the scrollbar/minimap track the entire scrollable area,
	// not just the content - they hit bottom when scroll hits bottom.
	const maxScroll = Math.max(0, scrollHeight - clientHeight)
	const scrollRatio = maxScroll > 0 ? Math.min(1, scrollTop / maxScroll) : 0

	// How much the minimap content needs to scroll to show the end of the document
	const maxMinimapScroll = Math.max(0, totalMinimapHeight - minimapHeight)
	const minimapScrollTop = scrollRatio * maxMinimapScroll

	// Slider position: moves from 0 to (minimapHeight - sliderHeight) as scroll ratio goes 0 to 1
	const sliderTop = scrollRatio * (minimapHeight - sliderHeight)

	return { minimapScrollTop, sliderTop, sliderHeight }
}

/**
 * Compute scroll offset in device pixels for canvas rendering.
 * Uses the same formula as the worker to ensure alignment.
 *
 * @param element - The scroll container element
 * @param lineCount - Total number of lines in the document
 * @param deviceHeight - Canvas height in device pixels
 * @param scale - DPR scale factor (typically Math.round(dpr))
 */
export const computeScrollOffset = (
	element: HTMLElement,
	lineCount: number,
	deviceHeight: number,
	scale: number
): number => {
	const scrollHeight = element.scrollHeight
	const clientHeight = element.clientHeight

	if (scrollHeight <= clientHeight) return 0

	// Use FULL scroll range including overscroll (matches getMinimapScrollState)
	const maxScroll = Math.max(0, scrollHeight - clientHeight)
	const scrollRatio =
		maxScroll > 0 ? Math.min(1, Math.max(0, element.scrollTop / maxScroll)) : 0

	// Worker's formula: maxScroll = lineCount * charH - deviceHeight
	const charH = MINIMAP_ROW_HEIGHT_CSS * scale
	const totalHeightDevice = lineCount * charH
	const maxScrollDevice = Math.max(0, totalHeightDevice - deviceHeight)

	return Math.round(scrollRatio * maxScrollDevice)
}
