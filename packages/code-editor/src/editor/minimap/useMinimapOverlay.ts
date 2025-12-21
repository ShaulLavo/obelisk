/**
 * Hook for minimap overlay rendering.
 * Handles cursor, selection, and error marker rendering on the overlay canvas.
 */

import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	type Accessor,
} from 'solid-js'
import { useCursor } from '../cursor'
import type { EditorError } from '../types'
import { MINIMAP_MAX_CHARS, MINIMAP_ROW_HEIGHT_CSS } from './constants'
import { getCanvasSizeCss, lineToMinimapY, syncCanvasDpr } from './minimapUtils'
import { computeMinimapSelectionRects } from './selectionGeometry'
import { computeScrollOffset, getMinimapScrollState } from './scrollUtils'

export type UseMinimapOverlayOptions = {
	/** Container element for sizing */
	container: Accessor<HTMLDivElement | null>
	/** Scroll container element */
	scrollElement: Accessor<HTMLElement | null>
	/** Error markers to display */
	errors?: Accessor<EditorError[] | undefined>
	/** Whether overlay should be visible */
	visible: Accessor<boolean>
}

export type MinimapOverlayController = {
	/** Overlay canvas ref setter */
	setCanvas: (el: HTMLCanvasElement | null) => void
	/** Overlay canvas accessor */
	canvas: Accessor<HTMLCanvasElement | null>
	/** Schedule an overlay render */
	scheduleRender: () => void
}

/**
 * Creates the overlay rendering logic for the minimap.
 * Draws slider, cursor highlight, selections, and error markers.
 */
export const useMinimapOverlay = (
	options: UseMinimapOverlayOptions
): MinimapOverlayController => {
	const { container, scrollElement, errors, visible } = options
	const cursor = useCursor()

	const [canvas, setCanvas] = createSignal<HTMLCanvasElement | null>(null)
	let rafOverlay = 0

	const scheduleRender = () => {
		if (rafOverlay) cancelAnimationFrame(rafOverlay)
		rafOverlay = requestAnimationFrame(() => {
			rafOverlay = 0
			renderOverlay()
		})
	}

	const renderOverlay = () => {
		const element = scrollElement()
		const overlayCanvas = canvas()
		if (!element || !overlayCanvas) return

		const size = getCanvasSizeCss(container())
		if (!size) return

		const { width, height: containerHeight } = size
		const { dpr, deviceWidth, deviceHeight } = syncCanvasDpr(
			overlayCanvas,
			width,
			containerHeight
		)

		const ctx = overlayCanvas.getContext('2d', {
			alpha: true,
			desynchronized: true,
		})
		if (!ctx) return

		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, deviceWidth, deviceHeight)

		const lineCount = cursor.lines.lineCount()
		if (lineCount <= 0) return

		const totalMinimapHeight = lineCount * MINIMAP_ROW_HEIGHT_CSS

		const { sliderTop, sliderHeight } = getMinimapScrollState(
			element,
			containerHeight,
			totalMinimapHeight
		)

		const sliderXCss = 1
		const sliderWidthCss = Math.max(1, width - 2)

		const x = sliderXCss * dpr
		const y = sliderTop * dpr
		const w = sliderWidthCss * dpr
		const h = sliderHeight * dpr

		// Draw slider background
		ctx.fillStyle = 'rgba(228, 228, 231, 0.10)'
		ctx.fillRect(x, y, w, h)

		const scale = Math.round(dpr)
		const rowHeightDevice = MINIMAP_ROW_HEIGHT_CSS * scale
		const charWidthDevice = Math.max(1, scale)

		// Compute scroll offset matching the worker's formula
		const scrollOffset = computeScrollOffset(
			element,
			lineCount,
			deviceHeight,
			scale
		)
		const maxCharsVisible = Math.min(
			MINIMAP_MAX_CHARS,
			Math.max(1, Math.ceil(deviceWidth / charWidthDevice))
		)

		// Draw cursor line highlight
		const cursorLine = cursor.state.position.line
		const cursorY = lineToMinimapY(cursorLine, rowHeightDevice, scrollOffset)
		const cursorHeight = Math.max(1, rowHeightDevice)

		if (cursorY + cursorHeight >= 0 && cursorY < deviceHeight) {
			ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
			ctx.fillRect(x, cursorY, w, cursorHeight)
		}

		// Draw selection ranges
		const selections = cursor.state.selections
		if (selections && selections.length > 0) {
			ctx.fillStyle = 'rgba(59, 130, 246, 0.5)' // Blue-500

			for (const selection of selections) {
				if (selection.anchor === selection.focus) continue

				const startOffset = Math.min(selection.anchor, selection.focus)
				const endOffset = Math.max(selection.anchor, selection.focus)

				const startPos = cursor.lines.offsetToPosition(startOffset)
				const endPos = cursor.lines.offsetToPosition(endOffset)

				const rects = computeMinimapSelectionRects(
					{
						startLine: startPos.line,
						startColumn: startPos.column,
						endLine: endPos.line,
						endColumn: endPos.column,
					},
					cursor.lines.getLineTextLength,
					{
						rowHeight: rowHeightDevice,
						charWidth: charWidthDevice,
						scrollOffset,
						deviceHeight,
						maxChars: maxCharsVisible,
						xOffset: x,
						clipWidth: w,
					}
				)

				for (const rect of rects) {
					ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
				}
			}
		}

		// Draw diagnostic markers
		const errorList = errors?.()
		if (errorList && errorList.length > 0) {
			for (const error of errorList) {
				const errorLine = cursor.lines.offsetToPosition(error.startIndex).line
				const errorY = lineToMinimapY(errorLine, rowHeightDevice, scrollOffset)

				const isWarning = error.isMissing
				ctx.fillStyle = isWarning
					? 'rgba(250, 204, 21, 0.85)' // yellow-400
					: 'rgba(239, 68, 68, 0.9)' // red-500

				const errorHeight = Math.max(cursorHeight, 3 * dpr)
				ctx.fillRect(x, errorY, w, errorHeight)

				// Add bright outline for emphasis
				ctx.strokeStyle = isWarning
					? 'rgba(234, 179, 8, 1)' // yellow-500 solid
					: 'rgba(220, 38, 38, 1)' // red-600 solid
				ctx.lineWidth = Math.max(1, dpr)
				ctx.strokeRect(x, errorY, w, errorHeight)
			}
		}
	}

	// Re-render overlay when cursor, selection, or errors change
	createEffect(
		on(
			() => [cursor.state.position.line, cursor.state.selections, errors?.()],
			() => {
				if (visible()) scheduleRender()
			}
		)
	)

	// Re-render when visibility changes to true
	createEffect(() => {
		if (visible()) scheduleRender()
	})

	onCleanup(() => {
		if (rafOverlay) cancelAnimationFrame(rafOverlay)
	})

	return {
		canvas,
		setCanvas,
		scheduleRender,
	}
}
