/**
 * Hook for minimap interaction handling (pointer, drag, wheel events).
 * Manages slider dragging and click-to-jump behavior.
 */

import { createSignal, type Accessor } from 'solid-js'
import { MINIMAP_ROW_HEIGHT_CSS } from './constants'
import { getMinimapScrollState } from './scrollUtils'

export type DragState = {
	pointerId: number
	dragOffsetY: number
	sliderHeight: number
}

export type MinimapInteractionOptions = {
	/** Accessor for the scroll container element */
	scrollElement: Accessor<HTMLElement | undefined>
	/** Accessor for canvas size in CSS pixels */
	getCanvasSizeCss: () => { width: number; height: number } | null
	/** Accessor for line count */
	getLineCount: () => number
}

export type MinimapInteractionHandlers = {
	/** Whether currently dragging the slider */
	isDragging: Accessor<boolean>
	/** Pointer down handler */
	handlePointerDown: (event: PointerEvent) => void
	/** Pointer move handler (drag) */
	handlePointerMove: (event: PointerEvent) => void
	/** Pointer up handler */
	handlePointerUp: (event: PointerEvent) => void
	/** Wheel handler (scroll passthrough) */
	handleWheel: (event: WheelEvent) => void
}

/**
 * Creates handlers for minimap interaction.
 * Handles slider dragging in a way that provides 1-to-1 mouse tracking.
 */
export const useMinimapInteraction = (
	options: MinimapInteractionOptions
): MinimapInteractionHandlers => {
	const { scrollElement, getCanvasSizeCss, getLineCount } = options

	const [isDragging, setIsDragging] = createSignal(false)
	let dragState: DragState | undefined

	const handlePointerDown = (event: PointerEvent) => {
		const element = scrollElement()
		if (!element) return

		const size = getCanvasSizeCss()
		if (!size) return

		const lineCount = getLineCount()
		const totalMinimapHeight = lineCount * MINIMAP_ROW_HEIGHT_CSS

		const { sliderTop, sliderHeight } = getMinimapScrollState(
			element,
			size.height,
			totalMinimapHeight
		)
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
		const localY = Math.max(0, Math.min(size.height, event.clientY - rect.top))
		const isOnSlider = localY >= sliderTop && localY <= sliderTop + sliderHeight

		if (isOnSlider) {
			dragState = {
				pointerId: event.pointerId,
				dragOffsetY: localY - sliderTop,
				sliderHeight,
			}
			;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
			setIsDragging(true)
		} else {
			// Click outside slider - jump to the exact text clicked
			const { minimapScrollTop } = getMinimapScrollState(
				element,
				size.height,
				totalMinimapHeight
			)
			const clickedMinimapY = minimapScrollTop + localY
			const clickedLine = Math.floor(clickedMinimapY / MINIMAP_ROW_HEIGHT_CSS)

			// Get the Y position of that line in the editor
			const editorLineHeight = element.scrollHeight / lineCount
			const targetY = clickedLine * editorLineHeight

			// Put the clicked line at the top of the viewport
			const clientHeight = element.clientHeight
			const scrollHeight = element.scrollHeight
			const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

			element.scrollTop = Math.max(0, Math.min(maxScrollTop, targetY))
		}
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (!dragState || event.pointerId !== dragState.pointerId) return

		const element = scrollElement()
		if (!element) return

		const size = getCanvasSizeCss()
		if (!size) return

		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()

		// For dragging, we use the slider position to determine scroll ratio:
		// sliderTop / (minimapHeight - sliderHeight) = scrollRatio
		// This gives 1-to-1 behavior: moving slider from top to bottom scrolls entire document

		const localY = Math.max(0, Math.min(size.height, event.clientY - rect.top))
		const newSliderTop = localY - dragState.dragOffsetY

		const minimapHeight = size.height
		const maxSliderTop = Math.max(0, minimapHeight - dragState.sliderHeight)
		const ratio = maxSliderTop > 0 ? newSliderTop / maxSliderTop : 0

		const scrollHeight = element.scrollHeight
		const clientHeight = element.clientHeight
		const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

		element.scrollTop = Math.max(
			0,
			Math.min(maxScrollTop, ratio * maxScrollTop)
		)
	}

	const handlePointerUp = (event: PointerEvent) => {
		if (dragState && event.pointerId === dragState.pointerId) {
			;(event.currentTarget as HTMLElement).releasePointerCapture(
				event.pointerId
			)
			dragState = undefined
			setIsDragging(false)
		}
	}

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault()
		const element = scrollElement()
		if (element) {
			element.scrollTop += event.deltaY
		}
	}

	return {
		isDragging,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handleWheel,
	}
}
