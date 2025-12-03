import { Show, createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import { estimateLineHeight } from '../utils'
import type { CursorState } from '../cursor'
import type { CursorMode } from '../types'

const CURSOR_WIDTH = 2
const CURSOR_HEIGHT_SHRINK = 2

export type CursorProps = {
	cursorState: Accessor<CursorState>
	fontSize: number
	fontFamily: string
	charWidth: number
	lineNumberWidth: number
	paddingLeft: number
	visibleLineStart: number
	visibleLineEnd: number
	getLineY: (lineIndex: number) => number
	cursorMode: Accessor<CursorMode>
}

export const Cursor = (props: CursorProps) => {
	const isVisible = createMemo(() => {
		const line = props.cursorState().position.line
		return line >= props.visibleLineStart && line <= props.visibleLineEnd
	})

	const shouldBlink = createMemo(() => props.cursorState().isBlinking)

	const cursorX = createMemo(() => {
		const column = props.cursorState().position.column
		return props.lineNumberWidth + props.paddingLeft + column * props.charWidth
	})

	const cursorYOffset = createMemo(() =>
		props.cursorMode() === 'terminal' ? 0 : CURSOR_HEIGHT_SHRINK / 2
	)

	const cursorY = createMemo(() => {
		const line = props.cursorState().position.line
		return props.getLineY(line) + cursorYOffset()
	})

	const cursorHeight = createMemo(() => {
		const base = estimateLineHeight(props.fontSize)
		return props.cursorMode() === 'terminal'
			? base
			: Math.max(1, base - CURSOR_HEIGHT_SHRINK)
	})

	const cursorWidth = createMemo(() =>
		props.cursorMode() === 'terminal' ? props.charWidth : CURSOR_WIDTH
	)

	const cursorBorderRadius = createMemo(() =>
		props.cursorMode() === 'terminal' ? '0px' : '1px'
	)

	const cursorOpacity = createMemo(() =>
		props.cursorMode() === 'terminal' ? 0.9 : 1
	)

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
