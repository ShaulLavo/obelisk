import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
	SelectionBounds,
	SelectionLayerProps,
	WhitespaceMarker,
} from '../types'
import { useCursor } from '../../cursor'
import { DEFAULT_TAB_SIZE } from '../../consts'
import {
	MAX_WHITESPACE_MARKERS,
	MAX_WHITESPACE_MARKER_SELECTION_LENGTH,
} from '../constants'

const normalizeCharWidth = (charWidth: number): number =>
	Number.isFinite(charWidth) && charWidth > 0 ? charWidth : 1

const normalizeTabSize = (tabSize: number): number =>
	Number.isFinite(tabSize) && tabSize > 0 ? tabSize : DEFAULT_TAB_SIZE

const getTabAdvance = (visualColumn: number, tabSize: number): number => {
	const remainder = visualColumn % tabSize
	return remainder === 0 ? tabSize : tabSize - remainder
}

export const useWhitespaceMarkers = (
	props: SelectionLayerProps,
	selectionBounds: Accessor<SelectionBounds | null>
) => {
	const cursor = useCursor()
	const whitespaceMarkers = createMemo<WhitespaceMarker[]>(() => {
		const bounds = selectionBounds()
		if (!bounds) return []

		// TODO: Virtualize whitespace markers (pool DOM nodes or render via canvas)
		// so large selections stay smooth without hard caps/disable.
		if (
			bounds.end - bounds.start >
			Math.max(0, MAX_WHITESPACE_MARKER_SELECTION_LENGTH)
		) {
			return []
		}

		const virtualItems = props.virtualItems()
		const lineHeight = props.lineHeight()
		const charWidth = normalizeCharWidth(props.charWidth())
		const tabSize = normalizeTabSize(props.tabSize())

		const markers: WhitespaceMarker[] = []
		const baseX = props.lineNumberWidth + props.paddingLeft
		const maxMarkers = Math.max(0, MAX_WHITESPACE_MARKERS)

		outer: for (const virtualRow of virtualItems) {
			const lineIndex = virtualRow.index
			if (lineIndex >= cursor.lines.lineCount()) continue

			const lineStart = cursor.lines.getLineStart(lineIndex)
			const lineEnd = lineStart + cursor.lines.getLineLength(lineIndex)

			if (bounds.end <= lineStart || bounds.start >= lineEnd) {
				continue
			}

			const selStart = Math.max(bounds.start, lineStart)
			const selEnd = Math.min(bounds.end, lineEnd)
			const startCol = selStart - lineStart
			const endCol = selEnd - lineStart

			if (startCol >= endCol) continue

			const text = cursor.lines.getLineText(lineIndex)
			const safeStartCol = Math.max(0, Math.min(startCol, text.length))
			const safeEndCol = Math.max(safeStartCol, Math.min(endCol, text.length))
			if (safeStartCol >= safeEndCol) continue

			const rowHeight = virtualRow.size || lineHeight
			const rowCenterY = virtualRow.start + rowHeight / 2

			let visualColumn = 0
			for (let column = 0; column < safeEndCol; column++) {
				const char = text[column]
				const columnOffsetStart = visualColumn * charWidth
				const advance =
					char === '\t' ? getTabAdvance(visualColumn, tabSize) : 1
				const nextVisualColumn = visualColumn + advance

				if (column >= safeStartCol && (char === ' ' || char === '\t')) {
					const columnOffsetEnd = nextVisualColumn * charWidth
					const columnWidth = Math.max(columnOffsetEnd - columnOffsetStart, 1)
					const isTab = char === '\t'

					const markerX = isTab
						? baseX + columnOffsetStart + 1
						: baseX + columnOffsetStart + columnWidth / 2

					markers.push({
						key: `${lineIndex}-${column}`,
						x: markerX,
						y: rowCenterY,
						type: isTab ? 'tab' : 'space',
						align: isTab ? 'left' : 'center',
					})

					if (maxMarkers > 0 && markers.length >= maxMarkers) {
						break outer
					}
				}

				visualColumn = nextVisualColumn
			}
		}

		return markers
	})
	return whitespaceMarkers
}
