import type { LineProps } from '../../types'
import { calculateColumnFromClick } from '../../utils'
import { BracketizedLineText } from './BracketizedLineText'

export const Line = (props: LineProps) => {
	let lineElement: HTMLDivElement | null = null

	const handleMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) {
			return
		}

		let column = props.entry.text.length
		if (lineElement) {
			const rect = lineElement.getBoundingClientRect()
			const clickX = event.clientX - rect.left

			column = calculateColumnFromClick(
				props.entry.text,
				clickX,
				props.charWidth,
				props.tabSize
			)
		}

		if (props.onMouseDown) {
			props.onMouseDown(event, props.entry.index, column, lineElement)
			return
		}

		if (event.shiftKey || event.ctrlKey || event.metaKey) {
			return
		}

		props.onPreciseClick(props.entry.index, column, event.shiftKey)
	}

	return (
		<div
			ref={(el) => {
				lineElement = el
			}}
			data-index={props.virtualRow.index}
			class="absolute left-0 whitespace-pre text-zinc-100"
			classList={{
				'cursor-text': props.isEditable(),
			}}
			style={{
				transform: `translateY(${props.virtualRow.start}px)`,
				'will-change': 'transform',
				top: 0,
				width: `${props.contentWidth}px`,
				height: `${props.virtualRow.size || props.lineHeight}px`,
				'tab-size': Math.max(1, props.tabSize),
			}}
			onMouseDown={handleMouseDown}
		>
			<BracketizedLineText
				text={props.entry.text}
				lineStart={props.entry.start}
				bracketDepths={props.bracketDepths}
				highlightSegments={props.highlights}
			/>
		</div>
	)
}
