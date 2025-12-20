import { loggers } from '@repo/logger'
import type { LineProps } from '../../types'
import { calculateColumnFromClick } from '../../utils'
import { BracketizedLineText } from './BracketizedLineText'

const log = loggers.codeEditor.withTag('line')

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

	const columnStart = props.virtualRow.columnStart
	const columnEnd = props.virtualRow.columnEnd
	const xOffset = columnStart * props.charWidth
	if (columnEnd < columnStart) {
		const message = 'Line virtual row column range is invalid'
		log.warn(message, {
			lineIndex: props.virtualRow.index,
			columnStart,
			columnEnd,
		})
		console.assert(false, message)
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
				transform: `translate(${xOffset}px, ${props.virtualRow.start}px)`,
				'will-change': 'transform',
				top: 0,
				'min-width': `${props.contentWidth}px`,
				width: '100%',
				height: `${props.virtualRow.size || props.lineHeight}px`,
				'tab-size': Math.max(1, props.tabSize),
			}}
			onMouseDown={handleMouseDown}
		>
			<BracketizedLineText
				text={props.entry.text}
				bracketDepths={props.lineBracketDepths}
				highlightSegments={props.highlights}
				columnStart={columnStart}
				columnEnd={columnEnd}
			/>
		</div>
	)
}
