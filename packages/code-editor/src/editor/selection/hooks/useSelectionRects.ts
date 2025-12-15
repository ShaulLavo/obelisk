import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type {
	SelectionBounds,
	SelectionLayerProps,
	SelectionRect,
} from '../types'
import { useCursor } from '../../cursor'
import { getTabAdvance, normalizeCharWidth, normalizeTabSize } from '../utils'

const getColumnOffsetsForRange = (options: {
	text: string
	startCol: number
	endCol: number
	charWidth: number
	tabSize: number
}): { startX: number; endX: number } => {
	const safeStartCol = Math.max(
		0,
		Math.min(options.startCol, options.text.length)
	)
	const safeEndCol = Math.max(
		safeStartCol,
		Math.min(options.endCol, options.text.length)
	)

	let visualColumn = 0
	let startX = 0
	let endX = 0

	for (let column = 0; column <= safeEndCol; column++) {
		if (column === safeStartCol) {
			startX = visualColumn * options.charWidth
		}

		if (column === safeEndCol) {
			endX = visualColumn * options.charWidth
			break
		}

		const char = options.text[column]
		if (char === '\t') {
			visualColumn += getTabAdvance(visualColumn, options.tabSize)
		} else {
			visualColumn += 1
		}
	}

	return { startX, endX }
}

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
		const charWidth = normalizeCharWidth(props.charWidth())
		const tabSize = normalizeTabSize(props.tabSize())

		const rects: SelectionRect[] = []
		const baseX = props.lineNumberWidth + props.paddingLeft

		for (const virtualRow of virtualItems) {
			const lineIndex = virtualRow.index
			if (lineIndex < 0 || lineIndex >= cursor.lines.lineCount()) continue

			const lineStart = cursor.lines.getLineStart(lineIndex)
			const lineEnd = lineStart + cursor.lines.getLineTextLength(lineIndex)

			if (bounds.end <= lineStart || bounds.start >= lineEnd) {
				continue
			}

			const selStart = Math.max(bounds.start, lineStart)
			const selEnd = Math.min(bounds.end, lineEnd)

			const startCol = selStart - lineStart
			const endCol = selEnd - lineStart

			const text = cursor.lines.getLineText(lineIndex)
			const { startX, endX } = getColumnOffsetsForRange({
				text,
				startCol,
				endCol,
				charWidth,
				tabSize,
			})

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
