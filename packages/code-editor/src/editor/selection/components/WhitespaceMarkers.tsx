import { For } from 'solid-js'
import type { Accessor } from 'solid-js'
import { VsArrowRight } from '@repo/icons/vs/VsArrowRight'
import { VsCircleSmallFilled } from '@repo/icons/vs/VsCircleSmallFilled'
import { MARKER_SIZE } from '../constants'
import type { WhitespaceMarker } from '../types'

type WhitespaceMarkersProps = {
	markers: Accessor<WhitespaceMarker[]>
}

export const WhitespaceMarkers = (props: WhitespaceMarkersProps) => (
	<For each={props.markers()}>
		{(marker) => (
			<div
				class="whitespace-marker pointer-events-none absolute"
				style={{
					left: `${marker.x}px`,
					top: `${marker.y}px`,
					width: `${MARKER_SIZE}px`,
					height: `${MARKER_SIZE}px`,
					transform:
						marker.align === 'center'
							? 'translate(-50%, -50%)'
							: 'translate(0, -50%)',
				}}
			>
				{marker.type === 'tab' ? (
					<VsArrowRight size={MARKER_SIZE} />
				) : (
					<VsCircleSmallFilled size={MARKER_SIZE * 0.75} />
				)}
			</div>
		)}
	</For>
)
