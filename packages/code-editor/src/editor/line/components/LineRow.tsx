import { Show, createMemo, splitProps, type Accessor } from 'solid-js'

import { useCursor } from '../../cursor'
import type {
	LineBracketDepthMap,
	LineEntry,
	LineHighlightSegment,
	VirtualItem2D,
} from '../../types'
import type { TextRun } from '../utils/textRuns'
import { Line } from './Line'

type LineRowProps = {
	virtualRow: VirtualItem2D
	lineHeight: Accessor<number>
	contentWidth: Accessor<number>
	charWidth: Accessor<number>
	tabSize: Accessor<number>
	isEditable: Accessor<boolean>
	onPreciseClick: (
		lineIndex: number,
		column: number,
		shiftKey?: boolean
	) => void
	onMouseDown?: (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => void
	activeLineIndex: Accessor<number | null>
	getLineBracketDepths: (entry: LineEntry) => LineBracketDepthMap | undefined
	getLineHighlights?: (entry: LineEntry) => LineHighlightSegment[] | undefined
	getCachedRuns?: (
		lineIndex: number,
		columnStart: number,
		columnEnd: number
	) => TextRun[] | undefined
	displayToLine?: (displayIndex: number) => number
}

const areHighlightSegmentsEqual = (
	a: LineHighlightSegment[] | undefined,
	b: LineHighlightSegment[] | undefined
) => {
	if (a === b) return true
	if (!a || !b) return false
	if (a.length !== b.length) return false

	for (let i = 0; i < a.length; i++) {
		const sA = a[i]
		const sB = b[i]
		if (
			!sA ||
			!sB ||
			sA.start !== sB.start ||
			sA.end !== sB.end ||
			sA.className !== sB.className
		) {
			return false
		}
	}
	return true
}

const areBracketDepthsEqual = (
	a: LineBracketDepthMap | undefined,
	b: LineBracketDepthMap | undefined
) => {
	if (a === b) return true
	if (!a || !b) return false
	const keysA = Object.keys(a)
	const keysB = Object.keys(b)
	if (keysA.length !== keysB.length) return false

	for (let i = 0; i < keysA.length; i++) {
		const key = keysA[i]!
		// @ts-expect-error - keys are numbers in type but strings in Object.keys
		if (a[key] !== b[key]) return false
	}
	return true
}

export const LineRow = (props: LineRowProps) => {
	const [local] = splitProps(props, [
		'virtualRow',
		'lineHeight',
		'contentWidth',
		'charWidth',
		'tabSize',
		'isEditable',
		'onPreciseClick',
		'onMouseDown',
		'activeLineIndex',
		'getLineBracketDepths',
		'getLineHighlights',
		'getCachedRuns',
		'displayToLine',
	])
	const cursor = useCursor()

	const lineIndex = createMemo(() =>
		local.displayToLine
			? local.displayToLine(local.virtualRow.index)
			: local.virtualRow.index
	)

	const isLineValid = createMemo(() => {
		const idx = lineIndex()
		const count = cursor.lines.lineCount()
		return idx >= 0 && idx < count
	})

	const lineText = createMemo(() => {
		if (!isLineValid()) return ''
		return cursor.lines.getLineText(lineIndex())
	})

	const entry = createMemo<LineEntry | null>(
		(prev) => {
			if (!isLineValid()) return null
			const idx = lineIndex()
			const start = cursor.lines.getLineStart(idx)
			const length = cursor.lines.getLineLength(idx)
			const text = lineText()
			if (
				prev &&
				prev.index === idx &&
				prev.start === start &&
				prev.length === length &&
				prev.text === text
			) {
				return prev
			}
			return {
				index: idx,
				start,
				length,
				text,
			}
		},
		null,
		{ equals: false }
	)

	const highlights = createMemo(
		() => {
			const e = entry()
			return e ? local.getLineHighlights?.(e) : undefined
		},
		undefined,
		{ equals: areHighlightSegmentsEqual }
	)

	const lineBracketDepths = createMemo(
		() => {
			const e = entry()
			return e ? local.getLineBracketDepths(e) : undefined
		},
		undefined,
		{ equals: areBracketDepthsEqual }
	)

	const cachedRuns = createMemo(() => {
		if (!local.getCachedRuns) return undefined
		if (!isLineValid()) return undefined
		const idx = lineIndex()
		return local.getCachedRuns(
			idx,
			local.virtualRow.columnStart,
			local.virtualRow.columnEnd
		)
	})

	const isActive = createMemo(() => local.activeLineIndex() === lineIndex())

	return (
		<Show when={isLineValid()}>
			<Line
				virtualRow={local.virtualRow}
				lineIndex={lineIndex()}
				lineText={lineText()}
				lineHeight={local.lineHeight()}
				contentWidth={local.contentWidth()}
				charWidth={local.charWidth()}
				tabSize={local.tabSize()}
				isEditable={local.isEditable}
				onPreciseClick={local.onPreciseClick}
				onMouseDown={local.onMouseDown}
				isActive={isActive()}
				lineBracketDepths={lineBracketDepths()}
				highlights={highlights()}
				cachedRuns={cachedRuns()}
			/>
		</Show>
	)
}
