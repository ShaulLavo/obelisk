import { For, Show, createMemo } from 'solid-js'
import { useCursor } from '../../cursor'
import type { LineEntry, LinesProps } from '../../types'
import { Line } from './Line'

export const Lines = (props: LinesProps) => {
	const cursor = useCursor()
	return (
		<div class="relative flex-1">
			<For each={props.rows()}>
				{(virtualRow) => {
					// Convert display index to actual line index (accounting for folds)
					// MUST be reactive so it updates when folds change
					const lineIndex = createMemo(() =>
						props.displayToLine
							? props.displayToLine(virtualRow.index)
							: virtualRow.index
					)

					const entry = createMemo<LineEntry | null>(() => {
						const idx = lineIndex()
						if (idx < 0 || idx >= cursor.lines.lineCount()) {
							return null
						}
						return {
							index: idx,
							start: cursor.lines.getLineStart(idx),
							length: cursor.lines.getLineLength(idx),
							text: cursor.lines.getLineText(idx),
						}
					})

					const highlights = createMemo(() => {
						const e = entry()
						return e ? props.getLineHighlights?.(e) : undefined
					})

					return (
						<Show when={entry()}>
							{(validEntry) => (
								<Line
									virtualRow={virtualRow}
									entry={validEntry()}
									lineHeight={props.lineHeight()}
									contentWidth={props.contentWidth()}
									charWidth={props.charWidth()}
									tabSize={props.tabSize()}
									isEditable={props.isEditable}
									onPreciseClick={props.onPreciseClick}
									onMouseDown={props.onMouseDown}
									isActive={props.activeLineIndex() === lineIndex()}
									bracketDepths={props.bracketDepths}
									highlights={highlights()}
								/>
							)}
						</Show>
					)
				}}
			</For>
		</div>
	)
}
