import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
	SelectionBounds,
	SelectionLayerProps,
	SelectionRect,
} from '../types'
import { useCursor } from '../../cursor'

export const useSelectionRects = (
	props: SelectionLayerProps,
	selectionBounds: Accessor<SelectionBounds | null>
) => {
	const cursor = useCursor()
	const selectionRects = createMemo<SelectionRect[]>(() => {
		const bounds = selectionBounds()
		if (!bounds) return []

		const virtualItems = props.virtualItems()
		const lineHeight = props.lineHeight()
		const charWidth = props.charWidth()

		const rects: SelectionRect[] = []
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

			const startX = props.getColumnOffset(lineIndex, startCol)
			const endX = props.getColumnOffset(lineIndex, endCol)

			let width = endX - startX
			if (width === 0 && selEnd > selStart) {
				width = charWidth
			}

			rects.push({
				x: baseX + startX,
				y: virtualRow.start,
				width: Math.max(width, 2),
				height: virtualRow.size || lineHeight,
			})
		}

		return rects
	})
	return selectionRects
}
