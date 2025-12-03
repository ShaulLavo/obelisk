/* eslint-disable solid/prefer-for */
import type { LineEntry, LinesProps } from '../types'
import { Line } from './Line'

export const Lines = (props: LinesProps) => {
	return (
		<>
			{props.rows().map(virtualRow => {
				const entry: LineEntry | undefined = props.entries()[virtualRow.index]
				if (!entry) return null

				return (
					<Line
						rowVirtualizer={props.rowVirtualizer}
						virtualRow={virtualRow}
						entry={entry}
						columns={props.columns()}
						totalColumnWidth={props.totalColumnWidth()}
						lineHeight={props.lineHeight()}
						fontSize={props.fontSize()}
						fontFamily={props.fontFamily()}
						onRowClick={props.onRowClick}
						onPreciseClick={props.onPreciseClick}
						isActive={props.activeLineIndex() === entry.index}
					/>
				)
			})}
		</>
	)
}
