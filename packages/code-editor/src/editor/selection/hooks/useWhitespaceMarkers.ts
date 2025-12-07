import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
	SelectionBounds,
	SelectionLayerProps,
	WhitespaceMarker
} from '../types'
import { useCursor } from '../../cursor'

export const useWhitespaceMarkers = (
	props: SelectionLayerProps,
	selectionBounds: Accessor<SelectionBounds | null>
) => {
	const cursor = useCursor()
	return createMemo<WhitespaceMarker[]>(() => {
		const bounds = selectionBounds()
		if (!bounds) return []

		const entries = cursor.lineEntries()
		const virtualItems = props.virtualItems()
		const lineHeight = props.lineHeight()

		const markers: WhitespaceMarker[] = []
		const baseX = props.lineNumberWidth + props.paddingLeft

		for (const virtualRow of virtualItems) {
			const lineIndex = virtualRow.index
			if (lineIndex >= entries.length) continue

			const entry = entries[lineIndex]
			if (!entry) continue

			const lineStart = entry.start
			const lineEnd = entry.start + entry.length

			if (bounds.end <= lineStart || bounds.start >= lineEnd) {
				continue
			}

			const selStart = Math.max(bounds.start, lineStart)
			const selEnd = Math.min(bounds.end, lineEnd)
			const startCol = selStart - lineStart
			const endCol = selEnd - lineStart

			if (startCol >= endCol) continue

			const rowHeight = virtualRow.size || lineHeight
			const rowCenterY = virtualRow.start + rowHeight / 2

			for (let column = startCol; column < endCol; column++) {
				const char = entry.text[column]
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
					align: isTab ? 'left' : 'center'
				})
			}
		}

		return markers
	})
}
