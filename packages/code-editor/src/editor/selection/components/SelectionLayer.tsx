import { For } from 'solid-js'
import type { SelectionLayerProps } from '../types'
import { useSelectionBounds } from '../hooks/useSelectionBounds'
import { useSelectionRects } from '../hooks/useSelectionRects'
import { useWhitespaceMarkers } from '../hooks/useWhitespaceMarkers'
import { WhitespaceMarkers } from './WhitespaceMarkers'

export const SelectionLayer = (props: SelectionLayerProps) => {
	const selectionBounds = useSelectionBounds()
	const selectionRects = useSelectionRects(props, selectionBounds)
	const whitespaceMarkers = useWhitespaceMarkers(props, selectionBounds)

	return (
		<div class="pointer-events-none absolute inset-0 z-0">
			<For each={selectionRects()}>
				{(rect) => (
					<div
						class="selection-rect absolute"
						style={{
							left: `${rect.x}px`,
							top: `${rect.y}px`,
							width: `${rect.width}px`,
							height: `${rect.height}px`,
						}}
					/>
				)}
			</For>
			<WhitespaceMarkers markers={whitespaceMarkers} />
		</div>
	)
}
