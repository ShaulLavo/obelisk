import { For, createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { VirtualItem } from '@tanstack/virtual-core'
import type { SelectionRange } from '../cursor'
import { getSelectionBounds } from '../cursor'
import type { LineEntry } from '../types'
import { VsArrowRight } from '@repo/icons/vs/VsArrowRight'
import { VsCircleSmallFilled } from '@repo/icons/vs/VsCircleSmallFilled'

const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'
const MARKER_SIZE = 8
const MARKER_COLOR = 'rgba(113, 113, 122, 0.9)'

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

type WhitespaceMarker = {
	key: string
	x: number
	y: number
	type: 'tab' | 'space'
	align: 'left' | 'center'
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

	const whitespaceMarkers = createMemo(() => {
		const bounds = selectionBounds()
		if (!bounds) return []

		const entries = props.lineEntries()
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
			<For each={whitespaceMarkers()}>
				{marker => (
					<div
						class="pointer-events-none absolute"
						style={{
							left: `${marker.x}px`,
							top: `${marker.y}px`,
							width: `${MARKER_SIZE}px`,
							height: `${MARKER_SIZE}px`,
							color: MARKER_COLOR,
							transform:
								marker.align === 'center'
									? 'translate(-50%, -50%)'
									: 'translate(0, -50%)'
						}}
					>
						{marker.type === 'tab' ? (
							<VsArrowRight size={MARKER_SIZE} />
						) : (
							<VsCircleSmallFilled size={MARKER_SIZE * 0.75} />
						)}
					</div>
				)}
			</For>
		</div>
	)
}
