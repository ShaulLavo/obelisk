import { For, createMemo } from 'solid-js'
import { useCursor } from '../../cursor'
import type { LineEntry, LinesProps } from '../../types'
import { Line } from './Line'

export const Lines = (props: LinesProps) => {
	const cursor = useCursor()
	return (
		<div class="relative flex-1">
			<For each={props.rows()}>
				{(virtualRow) => {
					const index = virtualRow.index
					if (index < 0 || index >= cursor.lines.lineCount()) {
						return null
					}

					const entry = createMemo<LineEntry>(() => ({
						index,
						start: cursor.lines.getLineStart(index),
						length: cursor.lines.getLineLength(index),
						text: cursor.lines.getLineText(index),
					}))

					const highlights = createMemo(() => props.getLineHighlights?.(entry()))

					return (
						<Line
							virtualRow={virtualRow}
							entry={entry()}
							lineHeight={props.lineHeight()}
							contentWidth={props.contentWidth()}
							charWidth={props.charWidth()}
							tabSize={props.tabSize()}
							isEditable={props.isEditable}
							onPreciseClick={props.onPreciseClick}
							onMouseDown={props.onMouseDown}
							isActive={props.activeLineIndex() === index}
							bracketDepths={props.bracketDepths}
							highlights={highlights()}
						/>
					)
				}}
			</For>
		</div>
	)
}
