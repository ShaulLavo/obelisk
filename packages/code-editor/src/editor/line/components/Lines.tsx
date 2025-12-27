import { For, createEffect } from 'solid-js'
import { endGlobalTrace, hasGlobalTrace } from '@repo/perf'
import { useCursor } from '../../cursor'
import type { LinesProps, VirtualItem2D } from '../../types'
import { LineRow } from './LineRow'

export const Lines = (props: LinesProps) => {
	const cursor = useCursor()
	// End keystroke trace when Lines re-renders (triggered by cursor/text changes)
	createEffect(() => {
		// Track cursor position to trigger on text changes
		void cursor.state.position.offset
		void cursor.lines.lineCount()

		// Use queueMicrotask to measure after Solid's render completes
		queueMicrotask(() => {
			if (hasGlobalTrace('keystroke')) {
				endGlobalTrace('keystroke', 'render')
			}
		})
	})

	return (
		<div class="relative flex-1">
			<For each={props.rows()}>
				{(virtualRow) => (
					<LineRow
						virtualRow={virtualRow}
						lineHeight={props.lineHeight}
						contentWidth={props.contentWidth}
						charWidth={props.charWidth}
						tabSize={props.tabSize}
						isEditable={props.isEditable}
						onPreciseClick={props.onPreciseClick}
						onMouseDown={props.onMouseDown}
						activeLineIndex={props.activeLineIndex}
						getLineBracketDepths={props.getLineBracketDepths}
						getLineHighlights={props.getLineHighlights}
						getCachedRuns={props.getCachedRuns}
						displayToLine={props.displayToLine}
					/>
				)}
			</For>
		</div>
	)
}
