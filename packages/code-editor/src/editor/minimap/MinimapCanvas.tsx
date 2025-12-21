/**
 * MinimapCanvas component.
 * A simple canvas element for the base minimap rendering (worker-rendered).
 */

export type MinimapCanvasProps = {
	/** Ref setter for the base canvas */
	setCanvas: (el: HTMLCanvasElement | null) => void
}

export const MinimapCanvas = (props: MinimapCanvasProps) => {
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
