/* eslint-disable solid/prefer-for */
import { useCursor } from '../../cursor'
import type { LineEntry, LinesProps } from '../../types'
import { Line } from './Line'

export const Lines = (props: LinesProps) => {
	const cursor = useCursor()
	return (
		<div class="relative flex-1">
			{props.rows().map(virtualRow => {
				const entry: LineEntry | undefined = cursor.lineEntries()[virtualRow.index]
				if (!entry) return null

				return (
					<Line
						rowVirtualizer={props.rowVirtualizer}
						virtualRow={virtualRow}
						entry={entry}
						lineHeight={props.lineHeight()}
						contentWidth={props.contentWidth()}
						charWidth={props.charWidth()}
						tabSize={props.tabSize()}
						onRowClick={props.onRowClick}
						onPreciseClick={props.onPreciseClick}
						onMouseDown={props.onMouseDown}
						isActive={props.activeLineIndex() === entry.index}
					/>
				)
			})}
		</div>
	)
}
