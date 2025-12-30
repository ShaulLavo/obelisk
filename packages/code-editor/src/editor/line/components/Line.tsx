import { Show, createMemo } from 'solid-js'
import type { LineProps } from '../../types'
import { calculateColumnFromClick } from '../../utils'
import { Syntax } from './Syntax'

export const Line = (props: LineProps) => {
	let lineElement: HTMLDivElement | null = null

	const handleMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) {
			return
		}

		if (!props.onMouseDown) {
			if (event.shiftKey || event.ctrlKey || event.metaKey) {
				return
			}
		}

		let column = props.lineText.length
		if (lineElement) {
			const rect = lineElement.getBoundingClientRect()
			// Adjust clickX by the xOffset to account for horizontal virtualization.
			// The line element is transformed by xOffset, so clicks relative to its rect
			// need to be offset by that amount to get the correct column position.
			const xOffsetPx = (props.virtualRow.columnStart ?? 0) * props.charWidth
			const clickX = event.clientX - rect.left + xOffsetPx

			column = calculateColumnFromClick(
				props.lineText,
				clickX,
				props.charWidth,
				props.tabSize
			)
		}

		if (props.onMouseDown) {
			props.onMouseDown(event, props.lineIndex, column, lineElement)
			return
		}

		props.onPreciseClick(props.lineIndex, column, event.shiftKey)
	}

	const columnStart = () => props.virtualRow.columnStart
	const columnEnd = () => props.columnEndOverride ?? props.virtualRow.columnEnd
	const columnRange = createMemo(() => {
		const start = columnStart()
		const end = columnEnd()
		if (end < start) {
			return null
		}
		return { start, end }
	})
	const xOffset = () => (columnRange()?.start ?? 0) * props.charWidth

	return (
		<Show when={columnRange()}>
			{(range) => (
				<Syntax
					ref={(el) => {
						lineElement = el
					}}
					text={props.lineText}
					bracketDepths={props.lineBracketDepths}
					highlightSegments={props.highlights}
					columnStart={range().start}
					columnEnd={range().end}
					cachedRuns={props.cachedRuns}
					lineIndex={props.lineIndex}
					isEditable={props.isEditable}
					style={{
						transform: `translate(${xOffset()}px, ${props.virtualRow.start}px)`,
						'min-width': `${props.contentWidth}px`,
						height: `${props.virtualRow.size || props.lineHeight}px`,
						'tab-size': Math.max(1, props.tabSize),
					}}
					onMouseDown={handleMouseDown}
				/>
			)}
		</Show>
	)
}
