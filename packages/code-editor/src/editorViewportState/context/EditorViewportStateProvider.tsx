import { createEffect, createMemo, createSignal } from 'solid-js'
import type { JSX } from 'solid-js'
import { createLogger } from '@repo/logger'

import {
	DEFAULT_FONT_FAMILY,
	DEFAULT_FONT_SIZE,
	DEFAULT_LINE_HEIGHT_RATIO
} from '../constants'
import {
	measureCharWidth,
	syncFontMetricsFromElement as syncFontMetricsFromElementUtil
} from '../utils'
import {
	EditorViewportStateContext,
	type EditorViewportStateValue
} from './EditorViewportStateContext'

const fontLogger = createLogger('web')
const safeRound = (value: number) => Math.round(value * 100) / 100

export function EditorViewportStateProvider(props: { children: JSX.Element }) {
	const [fontSize, setFontSize] = createSignal(DEFAULT_FONT_SIZE)
	const [fontFamily, setFontFamily] = createSignal(DEFAULT_FONT_FAMILY)

	const lineHeight = createMemo(() =>
		safeRound(fontSize() * DEFAULT_LINE_HEIGHT_RATIO)
	)

	const charWidth = createMemo(() => measureCharWidth(fontSize(), fontFamily()))

	const syncFontMetricsFromElement = (el: HTMLElement) =>
		syncFontMetricsFromElementUtil(el, {
			setFontFamily,
			setFontSize
		})

	createEffect(() => {
		fontLogger.debug(
			`Font metrics updated: size=${fontSize()} family=${fontFamily()} charWidth=${charWidth()} lineHeight=${lineHeight()}`
		)
	})

	const value: EditorViewportStateValue = {
		fontSize,
		setFontSize,
		fontFamily,
		setFontFamily,
		lineHeight,
		charWidth,
		syncFontMetricsFromElement
	}

	return (
		<EditorViewportStateContext.Provider value={value}>
			{props.children}
		</EditorViewportStateContext.Provider>
	)
}
