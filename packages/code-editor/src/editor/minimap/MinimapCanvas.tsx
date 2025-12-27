export type MinimapCanvasProps = {
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
