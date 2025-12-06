/* eslint-disable solid/prefer-for */
import { calculateColumnFromClick } from '../utils'
import type { LineProps } from '../types'

export const Line = (props: LineProps) => {
	let rowElement: HTMLDivElement | null = null
	let textContentElement: HTMLDivElement | null = null

	const measure = () => {
		props.rowVirtualizer.measureElement(rowElement)
	}

	const handleMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) {
			return
		}

		// Calculate column from click position
		let column = props.entry.text.length
		if (textContentElement) {
			const rect = textContentElement.getBoundingClientRect()
			const clickX = event.clientX - rect.left

			column = calculateColumnFromClick(
				props.entry.text,
				clickX,
				props.charWidth,
				props.tabSize
			)
		}

		// If custom mouse handler is provided, use it (for drag selection, double-click, etc.)
		if (props.onMouseDown) {
			props.onMouseDown(event, props.entry.index, column, textContentElement)
			return
		}

		// Fallback to simple click handling
		if (event.shiftKey || event.ctrlKey || event.metaKey) {
			return
		}

		props.onPreciseClick(props.entry.index, column, event.shiftKey)
	}
	return (
		<div
			data-index={props.virtualRow.index}
			ref={el => {
				rowElement = el
				queueMicrotask(measure)
			}}
			class="absolute left-0 right-0 flex items-start text-zinc-100"
			style={{
				transform: `translateY(${props.virtualRow.start}px)`,
				top: 0,
				height: `${props.virtualRow.size || props.lineHeight}px`
			}}
			onMouseDown={handleMouseDown}
		>
			<div
				ref={el => {
					textContentElement = el
				}}
				class="relative h-full whitespace-pre"
				style={{
					width: `${props.contentWidth}px`,
					height: `${props.virtualRow.size || props.lineHeight}px`,
					'tab-size': Math.max(1, props.tabSize)
				}}
			>
				{props.entry.text}
			</div>
		</div>
	)
}
