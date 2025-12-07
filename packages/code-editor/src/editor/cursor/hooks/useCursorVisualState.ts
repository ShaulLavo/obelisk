import { createMemo } from 'solid-js'
import { estimateLineHeight } from '../../utils'
import { useCursor } from '../../cursor'
import { CURSOR_HEIGHT_SHRINK, CURSOR_WIDTH } from '../consts'
import type { CursorProps } from '../components/Cursor'

export const useCursorVisualState = (props: CursorProps) => {
	const cursor = useCursor()
	const hasCursor = createMemo(() => Boolean(cursor.state.hasCursor))

	const isVisible = createMemo(() => {
		const line = cursor.state.position.line
		return (
			hasCursor() && line >= props.visibleLineStart && line <= props.visibleLineEnd
		)
	})

	const shouldBlink = createMemo(() => cursor.state.isBlinking)

	const cursorX = createMemo(() => {
		const state = cursor.state
		const columnOffset = props.getColumnOffset(
			state.position.line,
			state.position.column
		)
		return props.lineNumberWidth + props.paddingLeft + columnOffset
	})

	const cursorYOffset = createMemo(() =>
		props.cursorMode() === 'terminal' ? 0 : CURSOR_HEIGHT_SHRINK / 2
	)

	const cursorY = createMemo(() => {
		const line = cursor.state.position.line
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

	return {
		isVisible,
		shouldBlink,
		cursorX,
		cursorY,
		cursorWidth,
		cursorHeight,
		cursorBorderRadius,
		cursorOpacity
	}
}
