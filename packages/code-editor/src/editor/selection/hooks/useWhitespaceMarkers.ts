import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
	SelectionBounds,
	SelectionLayerProps,
	WhitespaceMarker,
} from '../types'
import { useCursor } from '../../cursor'

export const useWhitespaceMarkers = (
	props: SelectionLayerProps,
	selectionBounds: Accessor<SelectionBounds | null>
) => {
	const cursor = useCursor()
	const whitespaceMarkers = createMemo<WhitespaceMarker[]>(() => {
		const bounds = selectionBounds()
		if (!bounds) return []

		const virtualItems = props.virtualItems()
		const lineHeight = props.lineHeight()

		const markers: WhitespaceMarker[] = []
		const baseX = props.lineNumberWidth + props.paddingLeft

		for (const virtualRow of virtualItems) {
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

			for (let column = safeStartCol; column < safeEndCol; column++) {
				const char = text[column]
				if (char !== ' ' && char !== '\t') continue

				const columnOffsetStart = props.getColumnOffset(lineIndex, column)
				const columnOffsetEnd = props.getColumnOffset(lineIndex, column + 1)
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
			}
		}

		return markers
	})
	return whitespaceMarkers
}
