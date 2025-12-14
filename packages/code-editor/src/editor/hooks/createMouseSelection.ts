import { onCleanup, type Accessor } from 'solid-js'
import { LINE_NUMBER_WIDTH } from '../consts'
import { useCursor } from '../cursor'
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
		column: number
	) => void
}

const DOUBLE_CLICK_THRESHOLD = 300 // ms
const AUTO_SCROLL_MARGIN = 30 // pixels from edge
const AUTO_SCROLL_SPEED = 10 // pixels per frame

type MousePoint = {
	clientX: number
	clientY: number
}

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
	let autoScrollDirection: 'up' | 'down' | null = null
	let scrollRect: DOMRect | null = null
	let lastPointer: MousePoint | null = null
	let dragRafId = 0

	const stopAutoScroll = () => {
		if (autoScrollInterval) {
			clearInterval(autoScrollInterval)
			autoScrollInterval = null
		}
		autoScrollDirection = null
	}

	const startAutoScroll = (direction: 'up' | 'down') => {
		if (autoScrollInterval && autoScrollDirection === direction) return
		stopAutoScroll()
		autoScrollDirection = direction
		const scrollEl = options.scrollElement()
		if (!scrollEl) return

		autoScrollInterval = setInterval(() => {
			if (direction === 'up') {
				scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - AUTO_SCROLL_SPEED)
			} else {
				scrollEl.scrollTop += AUTO_SCROLL_SPEED
			}
			scheduleDragUpdate()
		}, 16) // ~60fps
	}

	const getPositionFromPointer = (
		point: MousePoint
	): { lineIndex: number; column: number } | null => {
		const scrollEl = options.scrollElement()
		if (!scrollEl) return null

		const rect = scrollRect ?? scrollEl.getBoundingClientRect()
		const lineCount = cursor.lines.lineCount()
		if (lineCount === 0) return null

		// Calculate Y position relative to scroll content
		const relativeY = point.clientY - rect.top + scrollEl.scrollTop
		const lineHeight = options.lineHeight()

		// Find line index
		let lineIndex = Math.floor(relativeY / lineHeight)
		lineIndex = Math.max(0, Math.min(lineIndex, lineCount - 1))

		// Calculate column (simplified - assumes click is on text area)
		const text = cursor.lines.getLineText(lineIndex)

		const relativeX = Math.max(0, point.clientX - rect.left + scrollEl.scrollLeft - LINE_NUMBER_WIDTH)

		const column = calculateColumnFromClick(
			text,
			relativeX,
			options.charWidth(),
			options.tabSize()
		)

		return { lineIndex, column }
	}

	const updateAutoScroll = (clientY: number) => {
		const scrollEl = options.scrollElement()
		if (!scrollEl) return
		const rect = scrollRect ?? scrollEl.getBoundingClientRect()

		if (clientY < rect.top + AUTO_SCROLL_MARGIN) {
			startAutoScroll('up')
		} else if (clientY > rect.bottom - AUTO_SCROLL_MARGIN) {
			startAutoScroll('down')
		} else {
			stopAutoScroll()
		}
	}

	const runDragUpdate = () => {
		if (!isDragging || anchorOffset === null) return
		if (!lastPointer) return

		const pos = getPositionFromPointer(lastPointer)
		if (!pos) return

		const focusOffset = cursor.lines.positionToOffset(pos.lineIndex, pos.column)
		cursor.actions.setSelection(anchorOffset, focusOffset)

		updateAutoScroll(lastPointer.clientY)
	}

	const scheduleDragUpdate = () => {
		if (dragRafId) return
		dragRafId = requestAnimationFrame(() => {
			dragRafId = 0
			runDragUpdate()
		})
	}

	const handleMouseMove = (event: MouseEvent) => {
		if (!isDragging || anchorOffset === null) return
		lastPointer = { clientX: event.clientX, clientY: event.clientY }
		scheduleDragUpdate()
	}

	const handleMouseUp = () => {
		isDragging = false
		anchorOffset = null
		scrollRect = null
		lastPointer = null
		stopAutoScroll()
		if (dragRafId) {
			cancelAnimationFrame(dragRafId)
			dragRafId = 0
		}
		document.removeEventListener('mousemove', handleMouseMove)
		document.removeEventListener('mouseup', handleMouseUp)
	}

	const handleMouseDown = (
		event: MouseEvent,
		lineIndex: number,
		column: number
	) => {
		if (event.button !== 0) return

		if (cursor.lines.lineCount() === 0) return

		const now = Date.now()
		const offset = cursor.lines.positionToOffset(lineIndex, column)

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
				lastPointer = { clientX: event.clientX, clientY: event.clientY }
				scrollRect = options.scrollElement()?.getBoundingClientRect() ?? null
				cursor.actions.setCursorFromClick(lineIndex, column, false)

				document.addEventListener('mousemove', handleMouseMove)
				document.addEventListener('mouseup', handleMouseUp)
		}
	}

	// Cleanup on unmount
	onCleanup(() => {
		stopAutoScroll()
		if (dragRafId) {
			cancelAnimationFrame(dragRafId)
			dragRafId = 0
		}
		document.removeEventListener('mousemove', handleMouseMove)
		document.removeEventListener('mouseup', handleMouseUp)
	})

	return { handleMouseDown }
}
