import { createVirtualizer } from '@tanstack/solid-virtual'
import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import { createEffect, createMemo, type Accessor } from 'solid-js'
import {
	VERTICAL_VIRTUALIZER_OVERSCAN,
	LINE_NUMBER_WIDTH
} from '../consts'
import {
	calculateColumnOffset,
	calculateVisualColumnCount,
	estimateLineHeight,
	measureCharWidth
} from '../utils'
import { useCursor } from '../cursor'

export type TextEditorLayoutOptions = {
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	isFileSelected: Accessor<boolean>
	tabSize: Accessor<number>
	scrollElement: () => HTMLDivElement | null
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
	rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
	virtualItems: () => VirtualItem[]
	totalSize: () => number
}

export function createTextEditorLayout(
	options: TextEditorLayoutOptions
): TextEditorLayout {
	const cursor = useCursor()
	const hasLineEntries = createMemo(() => cursor.lineEntries().length > 0)

	const activeLineIndex = createMemo<number | null>(() => {
		const entries = cursor.lineEntries()
		if (!entries.length) return null
		return cursor.state.position.line
	})

	const maxColumns = createMemo(() => {
		const entries = cursor.lineEntries()
		let max = 0
		const tabSize = options.tabSize()

		for (const entry of entries) {
			const visualWidth = calculateVisualColumnCount(entry.text, tabSize)
			if (visualWidth > max) {
				max = visualWidth
			}
		}

		return max
	})

	const charWidth = createMemo(() =>
		measureCharWidth(options.fontSize(), options.fontFamily())
	)

	const cursorLineIndex = createMemo(() => cursor.state.position.line)
	const cursorColumnIndex = createMemo(() => cursor.state.position.column)

	const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		get count() {
			return cursor.lineEntries().length
		},
		get enabled() {
			return options.isFileSelected() && hasLineEntries()
		},
		getScrollElement: () => options.scrollElement(),
		estimateSize: () => estimateLineHeight(options.fontSize()),
		overscan: VERTICAL_VIRTUALIZER_OVERSCAN
	})

	createEffect(() => {
		options.fontSize()
		options.fontFamily()
		cursor.lineEntries()
		queueMicrotask(() => {
			rowVirtualizer.measure()
		})
	})

	const virtualItems = () => rowVirtualizer.getVirtualItems()
	const totalSize = () => rowVirtualizer.getTotalSize()
	const lineHeight = createMemo(() => estimateLineHeight(options.fontSize()))
	const contentWidth = createMemo(() => {
		const visualColumns = maxColumns()
		if (visualColumns === 0) {
			return Math.max(options.fontSize(), 1)
		}
		return visualColumns * charWidth()
	})

	const columnOffset = (lineIndex: number, columnIndex: number): number => {
		const entry = cursor.lineEntries()[lineIndex]
		if (!entry) return 0
		return calculateColumnOffset(
			entry.text,
			columnIndex,
			charWidth(),
			options.tabSize()
		)
	}

	const inputX = createMemo(
		() => LINE_NUMBER_WIDTH + columnOffset(cursorLineIndex(), cursorColumnIndex())
	)

	const inputY = createMemo(() => cursorLineIndex() * lineHeight())

	const getLineY = (lineIndex: number): number => {
		return lineIndex * lineHeight()
	}

	const visibleLineRange = createMemo(() => {
		const items = virtualItems()
		if (items.length === 0) return { start: 0, end: 0 }
		return {
			start: items[0]?.index ?? 0,
			end: items[items.length - 1]?.index ?? 0
		}
	})

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
		rowVirtualizer,
		virtualItems,
		totalSize
	}
}
