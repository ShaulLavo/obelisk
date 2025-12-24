import { loggers } from '@repo/logger'
import type { LineProps } from '../../types'
import { calculateColumnFromClick } from '../../utils'
import { Syntax } from './Syntax'

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

	const columnStart = () => props.virtualRow.columnStart
	const columnEnd = () => props.virtualRow.columnEnd
	const xOffset = () => columnStart() * props.charWidth

	return (
		<div
			ref={(el) => {
				lineElement = el
			}}
			data-index={props.virtualRow.index}
			class="editor-line"
			classList={{
				'cursor-text': props.isEditable(),
			}}
			style={{
				transform: `translate(${xOffset()}px, ${props.virtualRow.start}px)`,
				'min-width': `${props.contentWidth}px`,
				height: `${props.virtualRow.size || props.lineHeight}px`,
				'tab-size': Math.max(1, props.tabSize),
			}}
			onMouseDown={handleMouseDown}
		>
			<Syntax
				text={props.entry.text}
				bracketDepths={props.lineBracketDepths}
				highlightSegments={props.highlights}
				columnStart={columnStart()}
				columnEnd={columnEnd()}
				cachedRuns={props.cachedRuns}
			/>
		</div>
	)
}
