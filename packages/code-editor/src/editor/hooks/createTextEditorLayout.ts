import {
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	untrack,
	type Accessor,
} from 'solid-js'

import { trackMicro } from '@repo/perf'
import {
	COLUMN_CHARS_PER_ITEM,
	DEFAULT_GUTTER_MODE,
	HORIZONTAL_VIRTUALIZER_OVERSCAN,
	VERTICAL_VIRTUALIZER_OVERSCAN,
} from '../consts'
import {
	calculateColumnOffset,
	calculateGutterWidth,
	calculateVisualColumnCount,
	estimateLineHeight,
	measureCharWidth,
} from '../utils'
import { useCursor } from '../cursor'
import type { FoldRange, VirtualItem2D } from '../types'
import { create2DVirtualizer } from './create2DVirtualizer'
import { createFoldMapping } from './createFoldMapping'

export type TextEditorLayoutOptions = {
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	isFileSelected: Accessor<boolean>
	filePath?: Accessor<string | undefined>
	tabSize: Accessor<number>
	scrollElement: () => HTMLDivElement | null
	folds?: Accessor<FoldRange[] | undefined>
	foldedStarts?: Accessor<Set<number>>
}

export type TextEditorLayout = {
	hasLineEntries: Accessor<boolean>
	activeLineIndex: Accessor<number | null>
	charWidth: Accessor<number>
	lineHeight: Accessor<number>
	contentWidth: Accessor<number>
	gutterWidth: Accessor<number>
	inputX: Accessor<number>
	inputY: Accessor<number>
	getColumnOffset: (lineIndex: number, columnIndex: number) => number
	getLineY: (lineIndex: number) => number
	visibleLineRange: Accessor<{ start: number; end: number }>
	virtualItems: Accessor<VirtualItem2D[]>
	totalSize: Accessor<number>
	/** Convert display row index to actual document line index */
	displayToLine: (displayIndex: number) => number
	/** Convert document line index to display row index (-1 if hidden) */
	lineToDisplay: (lineIndex: number) => number
	/** Check if a line is hidden inside a folded region */
	isLineHidden: (lineIndex: number) => boolean
	/** Scroll to a specific line index */
	scrollToLine: (lineIndex: number) => void
}

const measureLineHeight = (
	container: HTMLElement,
	fontSize: number,
	fontFamily: string
): number => {
	const probe = document.createElement('div')
	probe.textContent = 'M'
	probe.style.position = 'absolute'
	probe.style.visibility = 'hidden'
	probe.style.pointerEvents = 'none'
	probe.style.whiteSpace = 'pre'
	probe.style.padding = '0'
	probe.style.margin = '0'
	probe.style.fontSize = `${fontSize}px`
	probe.style.fontFamily = fontFamily

	container.appendChild(probe)
	const rect = probe.getBoundingClientRect()
	probe.remove()

	const height = Math.round(rect.height)
	return Number.isFinite(height) && height > 0
		? height
		: estimateLineHeight(fontSize)
}

const WIDTH_SCAN_BUDGET_MS = 6

export type WidthScanSliceResult = {
	nextIndex: number
	maxColumns: number
	done: boolean
	linesProcessed: number
}

export const scanLineWidthSlice = (options: {
	startIndex: number
	endIndex: number
	nextIndex: number
	maxColumns: number
	tabSize: number
	getLineText: (lineIndex: number) => string
	shouldYield: () => boolean
}): WidthScanSliceResult => {
	const startIndex = Math.min(options.startIndex, options.endIndex)
	const endIndex = Math.max(options.startIndex, options.endIndex)

	if (endIndex < startIndex) {
		return {
			nextIndex: startIndex,
			maxColumns: options.maxColumns,
			done: true,
			linesProcessed: 0,
		}
	}

	let nextIndex = Math.max(startIndex, Math.min(options.nextIndex, endIndex))
	let maxColumns = options.maxColumns
	let linesProcessed = 0

	while (nextIndex <= endIndex) {
		if (linesProcessed > 0 && options.shouldYield()) break

		const text = options.getLineText(nextIndex)
		const visualWidth = calculateVisualColumnCount(text, options.tabSize)
		if (visualWidth > maxColumns) maxColumns = visualWidth

		linesProcessed += 1
		nextIndex += 1
	}

	return {
		nextIndex,
		maxColumns,
		done: nextIndex > endIndex,
		linesProcessed,
	}
}

export const shouldResetWidthScan = (
	nextTabSize: number,
	prevTabSize: number
) => nextTabSize !== prevTabSize

export function createTextEditorLayout(
	options: TextEditorLayoutOptions
): TextEditorLayout {
	const cursor = useCursor()

	const hasLineEntries = createMemo(() => {
		const lineCount = cursor.lines.lineCount()
		const hasEntries = lineCount > 0
		console.log('[createTextEditorLayout] hasLineEntries', {
			lineCount,
			hasEntries,
			filePath: options.filePath?.(),
		})
		return hasEntries
	})

	const activeLineIndex = createMemo<number | null>(() => {
		if (!cursor.lines.lineCount()) return null
		return cursor.state.position.line
	})

	const charWidth = createMemo(() =>
		measureCharWidth(options.fontSize(), options.fontFamily())
	)

	const [measuredLineHeight, setMeasuredLineHeight] = createSignal(
		estimateLineHeight(options.fontSize())
	)

	createEffect(() => {
		options.fontSize()
		options.fontFamily()

		const scrollElement = options.scrollElement()
		if (!scrollElement) return

		queueMicrotask(() => {
			const height = measureLineHeight(
				scrollElement,
				options.fontSize(),
				options.fontFamily()
			)
			setMeasuredLineHeight(height)
		})
	})

	const lineHeight = createMemo(() => measuredLineHeight())

	// Create fold mapping to translate between display indices and document line indices
	const foldMapping = createFoldMapping({
		totalLines: () => cursor.lines.lineCount(),
		folds: () => options.folds?.(),
		foldedStarts: () => options.foldedStarts?.() ?? new Set<number>(),
	})

	// On-demand line length lookup for 2D virtualization
	const getLineLength = (displayIndex: number) =>
		cursor.lines.getLineLength(foldMapping.displayToLine(displayIndex))
	const getLineId = (displayIndex: number) =>
		cursor.lines.getLineId(foldMapping.displayToLine(displayIndex))

	const virtualizerEnabled = createMemo(() => {
		const isSelected = options.isFileSelected()
		const hasEntries = hasLineEntries()
		const hasScroll = Boolean(options.scrollElement())
		const enabled = isSelected && hasEntries && hasScroll
		console.log('[createTextEditorLayout] virtualizerEnabled', {
			isSelected,
			hasEntries,
			hasScroll,
			enabled,
			filePath: options.filePath?.(),
		})
		return enabled
	})

	const rowVirtualizer = create2DVirtualizer({
		// Use visible count from fold mapping instead of total line count
		count: foldMapping.visibleCount,
		enabled: virtualizerEnabled,
		scrollElement: () => options.scrollElement(),
		rowHeight: lineHeight,
		charWidth,
		overscan: VERTICAL_VIRTUALIZER_OVERSCAN,
		horizontalOverscan: HORIZONTAL_VIRTUALIZER_OVERSCAN * COLUMN_CHARS_PER_ITEM,
		getLineLength,
		getLineId,
	})

	const virtualItems = rowVirtualizer.virtualItems

	const totalSize = createMemo(() => {
		const baseSize = rowVirtualizer.totalSize()
		const padding = rowVirtualizer.viewportHeight() * 0.5
		const total = baseSize + padding
		console.log(`[createTextEditorLayout] totalSize: baseSize=${baseSize}, padding=${padding}, total=${total}`)
		return total
	})

	const [maxColumnsSeen, setMaxColumnsSeen] = createSignal(0)
	type WidthScanRange = {
		start: number
		end: number
		next: number
	}
	let lastWidthScanStart = 0
	let lastWidthScanEnd = -1
	let activeWidthScan: WidthScanRange | null = null
	let scheduledWidthScan = false
	let idleScanId: number | undefined
	let timeoutScanId: ReturnType<typeof setTimeout> | undefined

	type IdleDeadline = {
		timeRemaining: () => number
		didTimeout: boolean
	}

	const createYieldChecker = (deadline?: IdleDeadline) => {
		const budget = Math.min(
			WIDTH_SCAN_BUDGET_MS,
			deadline ? deadline.timeRemaining() : WIDTH_SCAN_BUDGET_MS
		)
		const start = performance.now()
		return () => performance.now() - start >= Math.max(0, budget)
	}

	const runWidthScan = (deadline?: IdleDeadline) => {
		scheduledWidthScan = false

		if (!activeWidthScan) return

		if (rowVirtualizer.isScrolling()) {
			scheduleWidthScan()
			return
		}

		const lineCount = cursor.lines.lineCount()
		if (lineCount === 0) {
			activeWidthScan = null
			return
		}

		const start = Math.max(0, Math.min(activeWidthScan.start, lineCount - 1))
		const end = Math.max(start, Math.min(activeWidthScan.end, lineCount - 1))
		const nextIndex = Math.max(start, Math.min(activeWidthScan.next, end))

		if (!(start <= end && nextIndex >= start && nextIndex <= end)) {
			activeWidthScan = null
			return
		}

		const previousMax = untrack(() => maxColumnsSeen())
		const shouldYield = createYieldChecker(deadline)
		const result = trackMicro(
			'layout.width-scan',
			() =>
				scanLineWidthSlice({
					startIndex: start,
					endIndex: end,
					nextIndex,
					maxColumns: previousMax,
					tabSize: options.tabSize(),
					getLineText: cursor.lines.getLineText,
					shouldYield,
				}),
			{
				threshold: 8,
				metadata: {
					start,
					end,
					next: nextIndex,
				},
			}
		)

		if (result.linesProcessed > 0 && result.maxColumns !== previousMax) {
			setMaxColumnsSeen(result.maxColumns)
		}

		if (result.done) {
			activeWidthScan = null
		} else {
			activeWidthScan = {
				start,
				end,
				next: result.nextIndex,
			}
		}

		if (activeWidthScan) {
			scheduleWidthScan()
		}
	}

	const scheduleWidthScan = () => {
		if (scheduledWidthScan || !activeWidthScan) return

		scheduledWidthScan = true
		if (requestIdleCallback) {
			idleScanId = requestIdleCallback((deadline) => runWidthScan(deadline), {
				timeout: 60,
			})
		} else {
			timeoutScanId = setTimeout(() => runWidthScan(), 0)
		}
	}

	const queueWidthScan = (
		from: number,
		to: number,
		options?: { replace?: boolean }
	) => {
		if (from > to) return
		if (!Number.isFinite(from) || !Number.isFinite(to)) {
			return
		}

		const lineCount = cursor.lines.lineCount()
		if (lineCount <= 0) {
			return
		}

		const clampedStart = Math.max(0, Math.min(from, lineCount - 1))
		const clampedEnd = Math.max(clampedStart, Math.min(to, lineCount - 1))

		if (clampedStart > clampedEnd) {
			return
		}

		if (!activeWidthScan || options?.replace) {
			activeWidthScan = {
				start: clampedStart,
				end: clampedEnd,
				next: clampedStart,
			}
		} else {
			activeWidthScan = {
				start: Math.min(activeWidthScan.start, clampedStart),
				end: Math.max(activeWidthScan.end, clampedEnd),
				next: Math.min(activeWidthScan.next, clampedStart),
			}
		}

		scheduleWidthScan()
	}

	let lastTabSize = options.tabSize()
	let lastFilePath = options.filePath?.()

	// *Approved*
	createEffect(() => {
		const tabSize = options.tabSize()
		const filePath = options.filePath?.()
		const shouldReset = shouldResetWidthScan(tabSize, lastTabSize)
		const shouldResetForPath = filePath !== lastFilePath
		lastTabSize = tabSize
		lastFilePath = filePath

		if (!shouldReset && !shouldResetForPath) {
			return
		}

		setMaxColumnsSeen(0)
		lastWidthScanStart = 0
		lastWidthScanEnd = -1
		activeWidthScan = null
		scheduledWidthScan = false

		if (idleScanId != null && cancelIdleCallback) {
			cancelIdleCallback(idleScanId)
			idleScanId = undefined
		}
		if (timeoutScanId != null) {
			clearTimeout(timeoutScanId)
			timeoutScanId = undefined
		}
	})

	// *Approved*
	createEffect(() => {
		const items = virtualItems()
		options.tabSize()

		if (items.length === 0) {
			lastWidthScanStart = 0
			lastWidthScanEnd = -1
			activeWidthScan = null
			return
		}

		const startIndex = items[0]?.index ?? 0
		const endIndex = items[items.length - 1]?.index ?? startIndex

		const overlaps =
			lastWidthScanEnd >= lastWidthScanStart &&
			endIndex >= lastWidthScanStart &&
			startIndex <= lastWidthScanEnd

		if (!overlaps) queueWidthScan(startIndex, endIndex, { replace: true })
		else {
			if (startIndex < lastWidthScanStart) {
				queueWidthScan(startIndex, lastWidthScanStart - 1)
			}
			if (endIndex > lastWidthScanEnd) {
				queueWidthScan(lastWidthScanEnd + 1, endIndex)
			}
		}

		lastWidthScanStart = startIndex
		lastWidthScanEnd = endIndex
	})

	onCleanup(() => {
		if (idleScanId != null && cancelIdleCallback) {
			cancelIdleCallback(idleScanId)
			idleScanId = undefined
		}
		if (timeoutScanId != null) {
			clearTimeout(timeoutScanId)
			timeoutScanId = undefined
		}
		activeWidthScan = null
		scheduledWidthScan = false
	})

	const contentWidth = createMemo(() => {
		const visualColumns = maxColumnsSeen()
		if (visualColumns === 0) {
			return Math.max(options.fontSize(), 1)
		}
		return Math.round(visualColumns * charWidth())
	})

	const columnOffset = (lineIndex: number, columnIndex: number): number => {
		const text = cursor.lines.getLineText(lineIndex)
		return calculateColumnOffset(
			text,
			columnIndex,
			charWidth(),
			options.tabSize()
		)
	}

	const cursorLineIndex = createMemo(() => cursor.state.position.line)
	const cursorColumnIndex = createMemo(() => cursor.state.position.column)

	// Calculate dynamic gutter width based on line count and mode
	const gutterWidth = createMemo(() =>
		calculateGutterWidth(
			cursor.lines.lineCount(),
			DEFAULT_GUTTER_MODE,
			options.fontSize(),
			options.fontFamily()
		)
	)

	const inputX = createMemo(
		() => gutterWidth() + columnOffset(cursorLineIndex(), cursorColumnIndex())
	)

	const inputY = createMemo(() => {
		const displayIndex = foldMapping.lineToDisplay(cursorLineIndex())
		return displayIndex * lineHeight()
	})

	const getLineY = (lineIndex: number): number => {
		const displayIndex = foldMapping.lineToDisplay(lineIndex)
		return Math.max(0, displayIndex) * lineHeight()
	}

	const scrollToLine = (lineIndex: number): void => {
		const displayIndex = foldMapping.lineToDisplay(lineIndex)
		console.log(`[createTextEditorLayout] scrollToLine: lineIndex=${lineIndex}, displayIndex=${displayIndex}, willScroll=${displayIndex >= 0}`)
		if (displayIndex >= 0) {
			rowVirtualizer.scrollToIndex(displayIndex, { align: 'start' })
		}
	}

	const visibleLineRange = rowVirtualizer.visibleRange

	return {
		hasLineEntries,
		activeLineIndex,
		charWidth,
		lineHeight,
		contentWidth,
		gutterWidth,
		inputX,
		inputY,
		getColumnOffset: columnOffset,
		getLineY,
		visibleLineRange,
		virtualItems,
		totalSize,
		displayToLine: foldMapping.displayToLine,
		lineToDisplay: foldMapping.lineToDisplay,
		isLineHidden: foldMapping.isLineHidden,
		scrollToLine,
	}
}
