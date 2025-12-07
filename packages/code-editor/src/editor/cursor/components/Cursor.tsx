import { Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { CursorMode } from '../../types'
import { useCursorVisualState } from '../hooks/useCursorVisualState'

export type CursorProps = {
	fontSize: number
	fontFamily: string
	charWidth: number
	lineNumberWidth: number
	paddingLeft: number
	visibleLineStart: number
	visibleLineEnd: number
	getColumnOffset: (lineIndex: number, columnIndex: number) => number
	getLineY: (lineIndex: number) => number
	cursorMode: Accessor<CursorMode>
}

export const Cursor = (props: CursorProps) => {
	const {
		isVisible,
		shouldBlink,
		cursorX,
		cursorY,
		cursorWidth,
		cursorHeight,
		cursorBorderRadius,
		cursorOpacity
	} = useCursorVisualState(props)

	return (
		<Show when={isVisible()}>
			<div
				class="pointer-events-none absolute z-10"
				classList={{
					[props.cursorMode() === 'regular'
						? 'cursor-blink-soft'
						: 'cursor-blink-hard']: shouldBlink()
				}}
				style={{
					left: `${cursorX()}px`,
					top: `${cursorY()}px`,
					width: `${cursorWidth()}px`,
					height: `${cursorHeight()}px`,
					'background-color':
						props.cursorMode() === 'terminal' ? '#f4f4f5' : '#e4e4e7',
					'border-radius': cursorBorderRadius(),
					'mix-blend-mode':
						props.cursorMode() === 'terminal' ? 'difference' : 'normal',
					opacity: cursorOpacity()
				}}
			/>
		</Show>
	)
}
