/* eslint-disable solid/prefer-for */
import { COLUMN_CHARS_PER_ITEM } from '../consts'
import { calculateColumnFromClick, measureCharWidth } from '../utils'
import type { LineProps } from '../types'

export const Line = (props: LineProps) => {
	let rowElement: HTMLDivElement | null = null
	let textContentElement: HTMLDivElement | null = null

	const measure = () => {
		props.rowVirtualizer.measureElement(rowElement)
	}

	const handleClick = (event: MouseEvent) => {
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
			return
		}

		if (textContentElement) {
			const rect = textContentElement.getBoundingClientRect()
			const clickX = event.clientX - rect.left
			const charWidth = measureCharWidth(props.fontSize, props.fontFamily)

			const column = calculateColumnFromClick(
				clickX,
				charWidth,
				props.entry.text.length
			)

			props.onPreciseClick(props.entry.index, column)
		} else {
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
			class="absolute left-0 right-0"
			style={{
				transform: `translateY(${props.virtualRow.start}px)`,
				top: 0,
				height: `${props.virtualRow.size || props.lineHeight}px`
			}}
		>
			<div class="flex items-start text-zinc-100" onMouseDown={handleClick}>
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
