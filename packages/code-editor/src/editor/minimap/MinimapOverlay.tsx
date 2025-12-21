/**
 * MinimapOverlay component.
 * A simple canvas element for rendering the minimap overlay (cursor, selections, errors).
 */

export type MinimapOverlayProps = {
	/** Ref setter for the overlay canvas */
	setCanvas: (el: HTMLCanvasElement | null) => void
}

export const MinimapOverlay = (props: MinimapOverlayProps) => {
	return (
		<canvas
			ref={props.setCanvas}
			class="absolute left-0 top-0 h-full w-full"
			style={{
				'pointer-events': 'none',
			}}
		/>
	)
}
