import {
	createEffect,
	createMemo,
	createSignal,
	untrack,
	type Accessor,
} from 'solid-js'
import { LINE_NUMBER_WIDTH, VERTICAL_VIRTUALIZER_OVERSCAN } from '../consts'
import {
	calculateColumnOffset,
	calculateVisualColumnCount,
	estimateLineHeight,
	measureCharWidth,
} from '../utils'
import { useCursor } from '../cursor'
import type { FoldRange, VirtualItem } from '../types'
import { createFixedRowVirtualizer } from './createFixedRowVirtualizer'
import { createFoldMapping } from './createFoldMapping'

export type TextEditorLayoutOptions = {
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	isFileSelected: Accessor<boolean>
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
	inputX: Accessor<number>
	inputY: Accessor<number>
	getColumnOffset: (lineIndex: number, columnIndex: number) => number
	getLineY: (lineIndex: number) => number
	visibleLineRange: Accessor<{ start: number; end: number }>
	virtualItems: Accessor<VirtualItem[]>
	totalSize: Accessor<number>
	/** Convert display row index to actual document line index */
	displayToLine: (displayIndex: number) => number
	/** Convert document line index to display row index (-1 if hidden) */
	lineToDisplay: (lineIndex: number) => number
	/** Check if a line is hidden inside a folded region */
	isLineHidden: (lineIndex: number) => boolean
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

export function createTextEditorLayout(
	options: TextEditorLayoutOptions
): TextEditorLayout {
	const cursor = useCursor()

	const hasLineEntries = createMemo(() => cursor.lines.lineCount() > 0)

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

	const rowVirtualizer = createFixedRowVirtualizer({
		// Use visible count from fold mapping instead of total line count
		count: foldMapping.visibleCount,
		enabled: () =>
			options.isFileSelected() &&
			hasLineEntries() &&
			Boolean(options.scrollElement()),
		scrollElement: () => options.scrollElement(),
		rowHeight: lineHeight,
		overscan: VERTICAL_VIRTUALIZER_OVERSCAN,
	})

	const virtualItems = rowVirtualizer.virtualItems
	const totalSize = rowVirtualizer.totalSize

	const [maxColumnsSeen, setMaxColumnsSeen] = createSignal(0)
	let lastWidthScanStart = 0
	let lastWidthScanEnd = -1

	createEffect(() => {
		options.tabSize()
		cursor.lines.lineStarts()
		setMaxColumnsSeen(0)
		lastWidthScanStart = 0
		lastWidthScanEnd = -1
	})

	createEffect(() => {
		const items = virtualItems()
		const tabSize = options.tabSize()

		if (items.length === 0) {
			lastWidthScanStart = 0
			lastWidthScanEnd = -1
			return
		}

		const startIndex = items[0]?.index ?? 0
		const endIndex = items[items.length - 1]?.index ?? startIndex

		const previousMax = untrack(() => maxColumnsSeen())
		let max = previousMax
		const scanRange = (from: number, to: number) => {
			for (let lineIndex = from; lineIndex <= to; lineIndex++) {
				const text = cursor.lines.getLineText(lineIndex)
				const visualWidth = calculateVisualColumnCount(text, tabSize)
				if (visualWidth > max) {
					max = visualWidth
				}
			}
		}

		const overlaps =
			lastWidthScanEnd >= lastWidthScanStart &&
			endIndex >= lastWidthScanStart &&
			startIndex <= lastWidthScanEnd

		if (!overlaps) {
			scanRange(startIndex, endIndex)
		} else {
			if (startIndex < lastWidthScanStart) {
				scanRange(startIndex, lastWidthScanStart - 1)
			}
			if (endIndex > lastWidthScanEnd) {
				scanRange(lastWidthScanEnd + 1, endIndex)
			}
		}

		lastWidthScanStart = startIndex
		lastWidthScanEnd = endIndex

		if (max !== previousMax) {
			setMaxColumnsSeen(max)
		}
	})

	const contentWidth = createMemo(() => {
		const visualColumns = maxColumnsSeen()
		if (visualColumns === 0) {
			return Math.max(options.fontSize(), 1)
		}
		return visualColumns * charWidth()
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

	const inputX = createMemo(
		() =>
			LINE_NUMBER_WIDTH + columnOffset(cursorLineIndex(), cursorColumnIndex())
	)

	const inputY = createMemo(() => {
		const displayIndex = foldMapping.lineToDisplay(cursorLineIndex())
		return displayIndex * lineHeight()
	})

	const getLineY = (lineIndex: number): number => {
		const displayIndex = foldMapping.lineToDisplay(lineIndex)
		return Math.max(0, displayIndex) * lineHeight()
	}

	const visibleLineRange = rowVirtualizer.visibleRange

	return {
		hasLineEntries,
		activeLineIndex,
		charWidth,
		lineHeight,
		contentWidth,
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
	}
}
