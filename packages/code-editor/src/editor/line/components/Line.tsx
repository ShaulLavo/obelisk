import type { LineProps } from '../../types'
import { calculateColumnFromClick } from '../../utils'
import { BracketizedLineText } from './BracketizedLineText'

export const Line = (props: LineProps) => {
	let textContentElement: HTMLDivElement | null = null

	const handleMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) {
			return
		}

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

		if (props.onMouseDown) {
			props.onMouseDown(event, props.entry.index, column, textContentElement)
			return
		}

		if (event.shiftKey || event.ctrlKey || event.metaKey) {
			return
		}

		props.onPreciseClick(props.entry.index, column, event.shiftKey)
	}

	return (
		<div
			data-index={props.virtualRow.index}
			class="absolute left-0 right-0 flex items-start text-zinc-100"
			classList={{
				'cursor-text': props.isEditable(),
			}}
			style={{
				transform: `translateY(${props.virtualRow.start}px)`,
				top: 0,
				height: `${props.virtualRow.size || props.lineHeight}px`,
			}}
			onMouseDown={handleMouseDown}
		>
			<div
				ref={(el) => {
					textContentElement = el
				}}
				class="relative h-full whitespace-pre"
				style={{
					width: `${props.contentWidth}px`,
					height: `${props.virtualRow.size || props.lineHeight}px`,
					'tab-size': Math.max(1, props.tabSize),
				}}
			>
				<BracketizedLineText
					text={props.entry.text}
					lineStart={props.entry.start}
					bracketDepths={props.bracketDepths}
					highlightSegments={props.highlights}
				/>
			</div>
		</div>
	)
}
