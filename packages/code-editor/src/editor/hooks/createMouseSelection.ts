import { onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import { positionToOffset, useCursor } from '../cursor'
import { calculateColumnFromClick } from '../utils'

export type MouseSelectionOptions = {
	scrollElement: Accessor<HTMLElement | null>
	charWidth: Accessor<number>
	tabSize: Accessor<number>
	lineHeight: Accessor<number>
}

export type MouseSelectionHandlers = {
	handleMouseDown: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
}

const DOUBLE_CLICK_THRESHOLD = 300 // ms
const AUTO_SCROLL_MARGIN = 30 // pixels from edge
const AUTO_SCROLL_SPEED = 10 // pixels per frame

export function createMouseSelection(
	options: MouseSelectionOptions
): MouseSelectionHandlers {
	const cursor = useCursor()
	let isDragging = false
	let anchorOffset: number | null = null
	let lastClickTime = 0
	let clickCount = 0
	let lastClickLine = -1
	let lastClickColumn = -1
	let autoScrollInterval: ReturnType<typeof setInterval> | null = null

	const stopAutoScroll = () => {
		if (autoScrollInterval) {
			clearInterval(autoScrollInterval)
			autoScrollInterval = null
		}
	}

	const startAutoScroll = (direction: 'up' | 'down') => {
		stopAutoScroll()
		const scrollEl = options.scrollElement()
		if (!scrollEl) return

		autoScrollInterval = setInterval(() => {
			if (direction === 'up') {
				scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - AUTO_SCROLL_SPEED)
			} else {
				scrollEl.scrollTop += AUTO_SCROLL_SPEED
			}
		}, 16) // ~60fps
	}

	const getPositionFromMouseEvent = (
		event: MouseEvent
	): { lineIndex: number; column: number } | null => {
		const scrollEl = options.scrollElement()
		if (!scrollEl) return null

		const rect = scrollEl.getBoundingClientRect()
		const entries = cursor.lineEntries()
		if (entries.length === 0) return null

		// Calculate Y position relative to scroll content
		const relativeY = event.clientY - rect.top + scrollEl.scrollTop
		const lineHeight = options.lineHeight()

		// Find line index
		let lineIndex = Math.floor(relativeY / lineHeight)
		lineIndex = Math.max(0, Math.min(lineIndex, entries.length - 1))

		// Calculate column (simplified - assumes click is on text area)
		const entry = entries[lineIndex]
		if (!entry) return null

		const relativeX = Math.max(
			0,
			event.clientX - rect.left + scrollEl.scrollLeft - 52
		) // 52 = approximate gutter width

		const column = calculateColumnFromClick(
			entry.text,
			relativeX,
			options.charWidth(),
			options.tabSize()
		)

		return { lineIndex, column }
	}

	const handleMouseMove = (event: MouseEvent) => {
		if (!isDragging || anchorOffset === null) return

		const pos = getPositionFromMouseEvent(event)
		if (!pos) return

		const entries = cursor.lineEntries()
		const focusOffset = positionToOffset(pos.lineIndex, pos.column, entries)

		cursor.actions.setSelection(anchorOffset, focusOffset)

		// Auto-scroll when near edges
		const scrollEl = options.scrollElement()
		if (scrollEl) {
			const rect = scrollEl.getBoundingClientRect()
			if (event.clientY < rect.top + AUTO_SCROLL_MARGIN) {
				startAutoScroll('up')
			} else if (event.clientY > rect.bottom - AUTO_SCROLL_MARGIN) {
				startAutoScroll('down')
			} else {
				stopAutoScroll()
			}
		}
	}

	const handleMouseUp = () => {
		isDragging = false
		stopAutoScroll()
		document.removeEventListener('mousemove', handleMouseMove)
		document.removeEventListener('mouseup', handleMouseUp)
	}

	const handleMouseDown = (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		_textElement: HTMLElement | null
	) => {
		if (event.button !== 0) return

		const entries = cursor.lineEntries()
		if (entries.length === 0) return

		const now = Date.now()
		const offset = positionToOffset(lineIndex, column, entries)

		// Detect click count for double/triple click
		if (
			now - lastClickTime < DOUBLE_CLICK_THRESHOLD &&
			lineIndex === lastClickLine &&
			Math.abs(column - lastClickColumn) <= 1
		) {
			clickCount++
		} else {
			clickCount = 1
		}
		lastClickTime = now
		lastClickLine = lineIndex
		lastClickColumn = column

		if (clickCount === 2) {
			// Double-click: select word
			event.preventDefault()
			cursor.actions.selectWord(offset)
			return
		}

		if (clickCount >= 3) {
			// Triple-click: select line
			event.preventDefault()
			cursor.actions.selectLine(lineIndex)
			clickCount = 0 // Reset to prevent quad-click issues
			return
		}

		// Single click
		if (event.shiftKey) {
			// Shift+click: extend selection
			event.preventDefault()
			cursor.actions.setCursorFromClick(lineIndex, column, true)
		} else {
			// Normal click: start potential drag
			event.preventDefault()
			anchorOffset = offset
			isDragging = true
			cursor.actions.setCursorFromClick(lineIndex, column, false)

			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
		}
	}

	// Cleanup on unmount
	onCleanup(() => {
		stopAutoScroll()
		document.removeEventListener('mousemove', handleMouseMove)
		document.removeEventListener('mouseup', handleMouseUp)
	})

	return { handleMouseDown }
}
