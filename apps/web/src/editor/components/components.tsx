/* eslint-disable solid/prefer-for */
import { COLUMN_CHARS_PER_ITEM } from '../consts'
import { measureCharWidth } from '../utils'
import type {
	LineEntry,
	VirtualizedRowProps,
	VirtualizedRowsProps
} from '../types'

interface GutterProps {
	lineNumber: number
	lineHeight: number
	isActive: boolean
}

const Gutter = (props: GutterProps) => {
	return (
		<span
			class="w-10 shrink-0 select-none text-right text-[11px] font-semibold tracking-[0.08em] tabular-nums flex items-center justify-end"
			classList={{
				'text-white': props.isActive,
				'text-zinc-500': !props.isActive
			}}
			style={{ height: `${props.lineHeight}px` }}
		>
			{props.lineNumber}
		</span>
	)
}

/**
 * Calculate the column from a click X position within the text area
 */
const calculateColumnFromClick = (
	clickX: number,
	charWidth: number,
	maxColumn: number
): number => {
	// Round to nearest character (not floor) for better UX
	const column = Math.round(clickX / charWidth)
	return Math.max(0, Math.min(column, maxColumn))
}

export const VirtualizedRow = (props: VirtualizedRowProps) => {
	let rowElement: HTMLDivElement | null = null
	let textContentElement: HTMLDivElement | null = null

	const measure = () => {
		props.rowVirtualizer.measureElement(rowElement)
	}

	const handleClick = (event: MouseEvent) => {
		// Only treat as a caret move on a plain left-click with no modifiers
		if (
			event.button !== 0 ||
			event.shiftKey ||
			event.ctrlKey ||
			event.metaKey
		) {
			return
		}

		const selection = window.getSelection()
		if (selection && !selection.isCollapsed) {
			// User has text selected, don't move cursor
			return
		}

		// Calculate precise click position
		if (textContentElement) {
			const rect = textContentElement.getBoundingClientRect()
			const clickX = event.clientX - rect.left
			const charWidth = measureCharWidth(props.fontSize, props.fontFamily)

			// Calculate column from click position
			const column = calculateColumnFromClick(
				clickX,
				charWidth,
				props.entry.text.length
			)

			props.onPreciseClick(props.entry.index, column)
		} else {
			// Fallback to old behavior
			props.onRowClick(props.entry)
		}
	}

	return (
		<div
			data-index={props.virtualRow.index}
			ref={el => {
				rowElement = el
				queueMicrotask(measure)
			}}
			class="absolute left-0 right-0 "
			style={{
				transform: `translateY(${props.virtualRow.start}px)`,
				top: 0,
				height: `${props.virtualRow.size || props.lineHeight}px`
			}}
		>
			<div
				class="flex items-start gap-4 px-3 text-zinc-100"
				classList={{ 'bg-zinc-900/60': props.isActive }}
				onMouseDown={handleClick}
			>
				<Gutter
					lineNumber={props.entry.index + 1}
					lineHeight={props.virtualRow.size || props.lineHeight}
					isActive={props.isActive}
				/>
				<div
					ref={el => {
						textContentElement = el
					}}
					class="relative h-full whitespace-pre"
					style={{
						width: `${props.totalColumnWidth}px`,
						height: `${props.virtualRow.size || props.lineHeight}px`
					}}
				>
					{props.columns.map(column => {
						const chunkStart = column.index * COLUMN_CHARS_PER_ITEM
						const chunkEnd = chunkStart + COLUMN_CHARS_PER_ITEM
						const chunkText = props.entry.text.slice(chunkStart, chunkEnd)
						if (!chunkText) return null
						return (
							<span
								data-column-index={column.index}
								class="absolute inset-y-0 overflow-hidden whitespace-pre"
								style={{
									transform: `translateX(${column.start}px)`,
									width: `${column.size}px`
								}}
							>
								{chunkText}
							</span>
						)
					})}
				</div>
			</div>
		</div>
	)
}

export const VirtualizedRows = (props: VirtualizedRowsProps) => {
	return (
		<>
			{props.rows().map(virtualRow => {
				const entry: LineEntry | undefined = props.entries()[virtualRow.index]
				if (!entry) return null

				return (
					<VirtualizedRow
						rowVirtualizer={props.rowVirtualizer}
						virtualRow={virtualRow}
						entry={entry}
						columns={props.columns()}
						totalColumnWidth={props.totalColumnWidth()}
						lineHeight={props.lineHeight()}
						fontSize={props.fontSize()}
						fontFamily={props.fontFamily()}
						onRowClick={props.onRowClick}
						onPreciseClick={props.onPreciseClick}
						isActive={props.activeLineIndex() === entry.index}
					/>
				)
			})}
		</>
	)
}
