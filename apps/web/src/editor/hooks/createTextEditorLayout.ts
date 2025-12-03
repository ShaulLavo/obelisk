import { createVirtualizer } from '@tanstack/solid-virtual'
import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import { createEffect, createMemo, type Accessor } from 'solid-js'
import {
	COLUMN_CHARS_PER_ITEM,
	HORIZONTAL_VIRTUALIZER_OVERSCAN,
	VERTICAL_VIRTUALIZER_OVERSCAN,
	LINE_NUMBER_WIDTH,
	CONTENT_GAP,
	EDITOR_PADDING_LEFT
} from '../consts'
import { estimateColumnWidth, estimateLineHeight, measureCharWidth } from '../utils'
import type { LineEntry } from '../types'
import type { CursorState } from '../cursor'

export type TextEditorLayoutOptions = {
	lineEntries: Accessor<LineEntry[]>
	cursorState: Accessor<CursorState>
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
	isFileSelected: Accessor<boolean>
	scrollElement: () => HTMLDivElement | null
}

export type TextEditorLayout = {
	hasLineEntries: Accessor<boolean>
	activeLineIndex: Accessor<number | null>
	charWidth: Accessor<number>
	lineHeight: Accessor<number>
	inputX: Accessor<number>
	inputY: Accessor<number>
	getLineY: (lineIndex: number) => number
	visibleLineRange: Accessor<{ start: number; end: number }>
	rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
	columnVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
	virtualItems: () => VirtualItem[]
	totalSize: () => number
	columnItems: () => VirtualItem[]
	columnTotalSize: () => number
}

export function createTextEditorLayout(
	options: TextEditorLayoutOptions
): TextEditorLayout {
	const hasLineEntries = createMemo(() => options.lineEntries().length > 0)

	const activeLineIndex = createMemo<number | null>(() => {
		const entries = options.lineEntries()
		if (!entries.length) return null
		return options.cursorState().position.line
	})

	const maxColumnChunks = createMemo(() => {
		const entries = options.lineEntries()
		if (!entries.length) return 0
		let max = 0
		for (const entry of entries) {
			const chunks = Math.max(
				1,
				Math.ceil(entry.text.length / COLUMN_CHARS_PER_ITEM)
			)
			if (chunks > max) {
				max = chunks
			}
		}
		return max
	})

	const charWidth = createMemo(() =>
		measureCharWidth(options.fontSize(), options.fontFamily())
	)

	const cursorLineIndex = createMemo(() => options.cursorState().position.line)
	const cursorColumnIndex = createMemo(
		() => options.cursorState().position.column
	)

	const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		get count() {
			return options.lineEntries().length
		},
		get enabled() {
			return options.isFileSelected() && hasLineEntries()
		},
		getScrollElement: () => options.scrollElement(),
		estimateSize: () => estimateLineHeight(options.fontSize()),
		overscan: VERTICAL_VIRTUALIZER_OVERSCAN
	})

	const columnVirtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		horizontal: true,
		get count() {
			return Math.max(maxColumnChunks(), 1)
		},
		get enabled() {
			return options.isFileSelected() && hasLineEntries()
		},
		getScrollElement: () => options.scrollElement(),
		estimateSize: () => estimateColumnWidth(options.fontSize()),
		overscan: HORIZONTAL_VIRTUALIZER_OVERSCAN
	})

	createEffect(() => {
		options.fontSize()
		options.fontFamily()
		options.lineEntries()
		queueMicrotask(() => {
			rowVirtualizer.measure()
			columnVirtualizer.measure()
		})
	})

	const virtualItems = () => rowVirtualizer.getVirtualItems()
	const totalSize = () => rowVirtualizer.getTotalSize()
	const columnItems = () => columnVirtualizer.getVirtualItems()
	const columnTotalSize = () => columnVirtualizer.getTotalSize()
	const lineHeight = createMemo(() => estimateLineHeight(options.fontSize()))

	const inputX = createMemo(
		() =>
			LINE_NUMBER_WIDTH +
			CONTENT_GAP +
			EDITOR_PADDING_LEFT +
			cursorColumnIndex() * charWidth()
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
		inputX,
		inputY,
		getLineY,
		visibleLineRange,
		rowVirtualizer,
		columnVirtualizer,
		virtualItems,
		totalSize,
		columnItems,
		columnTotalSize
	}
}

