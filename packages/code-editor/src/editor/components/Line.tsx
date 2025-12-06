/* eslint-disable solid/prefer-for */
import { calculateColumnFromClick } from '../utils'
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

		if (!textContentElement) {
			props.onRowClick(props.entry)
			return
		}

		const rect = textContentElement.getBoundingClientRect()
		const clickX = event.clientX - rect.left

		const column = calculateColumnFromClick(
			props.entry.text,
			clickX,
			props.charWidth,
			props.tabSize
		)

		props.onPreciseClick(props.entry.index, column)
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
			onMouseDown={handleClick}
		>
			<div
				ref={el => {
					textContentElement = el
				}}
				class="relative h-full whitespace-pre"
				style={{
					width: `${props.contentWidth}px`,
					height: `${props.virtualRow.size || props.lineHeight}px`,
					'tab-size': `${Math.max(1, props.tabSize)}`
				}}
			>
				{props.entry.text}
			</div>
		</div>
	)
}
