import { SCROLL_CONTEXT_ROWS, LINE_NUMBER_WIDTH } from '../consts'

const HORIZONTAL_SCROLL_PADDING = 20
const HORIZONTAL_SCROLL_BUFFER = 40

export type CursorScrollSyncOptions = {
	scrollElement: () => HTMLElement | null
	lineHeight: () => number
	charWidth: () => number
	contextRows?: number
}

export type CursorScrollSync = {
	scrollToLine: (line: number) => void
	scrollToColumn: (column: number) => void
	scrollToCursor: (line: number, column: number) => void
}

/**
 * Creates scroll functions to keep the cursor visible within the scroll container.
 * Call these functions manually after keyboard navigation (not on mouse clicks).
 *
 * @param options - Configuration for scroll synchronization
 * @returns Object with scroll functions
 */
export function createCursorScrollSync(
	options: CursorScrollSyncOptions
): CursorScrollSync {
	const contextRows = options.contextRows ?? SCROLL_CONTEXT_ROWS

	const scrollToLine = (line: number) => {
		const scrollEl = options.scrollElement()
		if (!scrollEl) return

		const lineHeightVal = options.lineHeight()
		const cursorY = line * lineHeightVal
		const viewportHeight = scrollEl.clientHeight
		const scrollTop = scrollEl.scrollTop

		// Margin to keep cursor away from edges
		const margin = lineHeightVal * contextRows

		// Check if cursor is too close to top edge
		if (cursorY < scrollTop + margin) {
			// Scroll up to show cursor with context above
			const targetScroll = Math.max(0, cursorY - margin)
			scrollEl.scrollTop = targetScroll
		}
		// Check if cursor is too close to bottom edge
		else if (cursorY + lineHeightVal > scrollTop + viewportHeight - margin) {
			// Scroll down to show cursor with context below
			const targetScroll = cursorY + lineHeightVal + margin - viewportHeight
			scrollEl.scrollTop = targetScroll
		}
	}

	const scrollToColumn = (column: number) => {
		const scrollEl = options.scrollElement()
		if (!scrollEl) return

		const cw = options.charWidth()
		const cursorX = column * cw
		const gutterWidth = LINE_NUMBER_WIDTH

		const scrollLeft = scrollEl.scrollLeft
		const viewportWidth = scrollEl.clientWidth
		const absoluteCursorX = gutterWidth + cursorX

		// Check if cursor is outside horizontal viewport
		if (absoluteCursorX < scrollLeft + gutterWidth) {
			scrollEl.scrollLeft = Math.max(
				0,
				absoluteCursorX - gutterWidth - HORIZONTAL_SCROLL_PADDING
			)
		} else if (
			absoluteCursorX >
			scrollLeft + viewportWidth - HORIZONTAL_SCROLL_PADDING
		) {
			scrollEl.scrollLeft = absoluteCursorX - viewportWidth + HORIZONTAL_SCROLL_BUFFER
		}
	}

	const scrollToCursor = (line: number, column: number) => {
		scrollToLine(line)
		scrollToColumn(column)
	}

	return { scrollToLine, scrollToColumn, scrollToCursor }
}
