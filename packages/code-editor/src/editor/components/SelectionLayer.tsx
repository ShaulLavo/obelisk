import { For, createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { VirtualItem } from '@tanstack/virtual-core'
import type { SelectionRange } from '../cursor'
import { getSelectionBounds } from '../cursor'
import type { LineEntry } from '../types'

const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'

export type SelectionLayerProps = {
	selections: Accessor<SelectionRange[]>
	lineEntries: Accessor<LineEntry[]>
	virtualItems: Accessor<VirtualItem[]>
	lineHeight: Accessor<number>
	lineNumberWidth: number
	paddingLeft: number
	charWidth: Accessor<number>
	tabSize: Accessor<number>
	getColumnOffset: (lineIndex: number, columnIndex: number) => number
	getLineY: (lineIndex: number) => number
}

type SelectionRect = {
	x: number
	y: number
	width: number
	height: number
}

export const SelectionLayer = (props: SelectionLayerProps) => {
	// Get the first selection (for now, single selection support)
	const selection = createMemo(() => {
		const selections = props.selections()
		return selections.length > 0 ? selections[0] : null
	})

	// Get normalized bounds
	const selectionBounds = createMemo(() => {
		const sel = selection()
		if (!sel) return null
		const bounds = getSelectionBounds(sel)
		// Don't render if selection is empty
		if (bounds.start === bounds.end) return null
		return bounds
	})

	// Calculate which visible lines are in the selection
	const visibleSelectionRects = createMemo(() => {
		const bounds = selectionBounds()
		if (!bounds) return []

		const entries = props.lineEntries()
		const virtualItems = props.virtualItems()
		const lineHeight = props.lineHeight()
		const charWidth = props.charWidth()

		const rects: (SelectionRect & { key: number })[] = []

		for (const virtualRow of virtualItems) {
			const lineIndex = virtualRow.index
			if (lineIndex >= entries.length) continue

			const entry = entries[lineIndex]
			if (!entry) continue

			const lineStart = entry.start
			const lineEnd = entry.start + entry.length

			// Check if this line intersects the selection
			if (bounds.end <= lineStart || bounds.start >= lineEnd) {
				continue
			}

			// Calculate selection range within this line
			const selStart = Math.max(bounds.start, lineStart)
			const selEnd = Math.min(bounds.end, lineEnd)

			// Convert to columns within the line
			const startCol = selStart - lineStart
			const endCol = selEnd - lineStart

			// Get pixel positions
			const startX = props.getColumnOffset(lineIndex, startCol)
			const endX = props.getColumnOffset(lineIndex, endCol)

			// Handle selection at end of line (include newline visual space)
			let width = endX - startX
			if (width === 0 && selEnd > selStart) {
				// Selection includes newline but no visible characters
				// Show a small rectangle to indicate selection
				width = charWidth
			}

			rects.push({
				key: lineIndex,
				x: props.lineNumberWidth + props.paddingLeft + startX,
				y: virtualRow.start,
				width: Math.max(width, 2), // Minimum 2px width for visibility
				height: virtualRow.size || lineHeight
			})
		}

		return rects
	})

	return (
		<div class="pointer-events-none absolute inset-0 z-0">
			<For each={visibleSelectionRects()}>
				{rect => (
					<div
						class="absolute"
						style={{
							left: `${rect.x}px`,
							top: `${rect.y}px`,
							width: `${rect.width}px`,
							height: `${rect.height}px`,
							'background-color': SELECTION_COLOR
						}}
					/>
				)}
			</For>
		</div>
	)
}
