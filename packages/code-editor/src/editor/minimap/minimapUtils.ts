/**
 * Pure utility functions for minimap calculations.
 * These have no side effects and don't depend on Solid.js reactivity.
 */

import {
	MINIMAP_MAX_CHARS,
	MINIMAP_MAX_WIDTH_CSS,
	MINIMAP_MIN_WIDTH_CSS,
	MINIMAP_PADDING_X_CSS,
	MINIMAP_ROW_HEIGHT_CSS,
	MINIMAP_WIDTH_RATIO,
} from './constants'
import type { MinimapLayout } from './workerTypes'

/**
 * Get the container dimensions in CSS pixels.
 */
export const getCanvasSizeCss = (
	container: HTMLElement | null
): { width: number; height: number } | null => {
	if (!container) return null
	const rect = container.getBoundingClientRect()
	const width = Math.max(1, Math.round(rect.width))
	const height = Math.max(1, Math.round(rect.height))
	return { width, height }
}

/**
 * Sync canvas dimensions with device pixel ratio.
 * Returns the DPR and device dimensions.
 */
export const syncCanvasDpr = (
	canvas: HTMLCanvasElement,
	width: number,
	height: number
): { dpr: number; deviceWidth: number; deviceHeight: number } => {
	const dpr = window.devicePixelRatio || 1
	const deviceWidth = Math.max(1, Math.round(width * dpr))
	const deviceHeight = Math.max(1, Math.round(height * dpr))
	if (canvas.width !== deviceWidth) canvas.width = deviceWidth
	if (canvas.height !== deviceHeight) canvas.height = deviceHeight
	return { dpr, deviceWidth, deviceHeight }
}

/**
 * Build the minimap layout object from container dimensions.
 */
export const getMinimapLayout = (
	container: HTMLElement | null
): MinimapLayout | null => {
	const size = getCanvasSizeCss(container)
	if (!size) return null

	const dpr = window.devicePixelRatio || 1
	return {
		mode: 'blocks',
		minimapLineHeightCss: MINIMAP_ROW_HEIGHT_CSS,
		maxChars: MINIMAP_MAX_CHARS,
		paddingXCss: MINIMAP_PADDING_X_CSS,
		size: {
			cssWidth: size.width,
			cssHeight: size.height,
			dpr,
			deviceWidth: Math.round(size.width * dpr),
			deviceHeight: Math.round(size.height * dpr),
		},
	}
}

/**
 * Calculate the minimap width based on editor width.
 */
export const computeMinimapWidthCss = (editorWidth: number): number => {
	const raw = Math.round(editorWidth / MINIMAP_WIDTH_RATIO)
	return Math.max(MINIMAP_MIN_WIDTH_CSS, Math.min(MINIMAP_MAX_WIDTH_CSS, raw))
}

/**
 * Convert a line number to minimap Y position in device pixels.
 * Applies scroll offset to project onto the visible canvas area.
 */
export const lineToMinimapY = (
	line: number,
	rowHeightDevice: number,
	scrollOffset: number
): number => {
	const absoluteY = line * rowHeightDevice
	return absoluteY - scrollOffset
}
