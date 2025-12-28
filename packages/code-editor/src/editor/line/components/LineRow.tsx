import { Show, createMemo, splitProps, type Accessor } from 'solid-js'

import { useCursor } from '../../cursor'
import type {
	LineBracketDepthMap,
	LineEntry,
	LineHighlightSegment,
	VirtualItem2D,
} from '../../types'
import type { TextRun } from '../utils/textRuns'
import { VIRTUALIZATION_THRESHOLD } from '../../hooks/create2DVirtualizer'
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
	highlightRevision?: Accessor<number>
	getCachedRuns?: (
		lineIndex: number,
		columnStart: number,
		columnEnd: number,
		lineId?: number
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
		'highlightRevision',
		'getCachedRuns',
		'displayToLine',
	])
	const cursor = useCursor()

	const resolvedLineId = createMemo(() => {
		const lineId = local.virtualRow.lineId
		if (lineId > 0) return lineId

		const idx = local.virtualRow.index
		if (idx >= 0) {
			const resolved = cursor.lines.getLineId(idx)
			if (resolved > 0) return resolved
		}

		return lineId
	})

	const lineIndex = createMemo(() => {
		const lineId = resolvedLineId()
		if (lineId > 0) {
			const resolved = cursor.lines.getLineIndex(lineId)
			if (resolved >= 0) return resolved
		}

		const rawIndex = local.virtualRow.index
		if (rawIndex < 0) return -1
		return local.displayToLine ? local.displayToLine(rawIndex) : rawIndex
	})

	const isLineValid = createMemo(() => {
		const idx = lineIndex()
		const count = cursor.lines.lineCount()
		return idx >= 0 && idx < count
	})

	const lineText = createMemo(() => {
		const lineId = resolvedLineId()
		if (lineId > 0) {
			return cursor.lines.getLineTextById(lineId)
		}
		if (!isLineValid()) return ''
		return cursor.lines.getLineText(lineIndex())
	})

	const entry = createMemo<LineEntry | null>((prev) => {
		if (!isLineValid()) return null
		const idx = lineIndex()
		const lineId = resolvedLineId()
		const start =
			lineId > 0 ? cursor.lines.getLineStartById(lineId) : cursor.lines.getLineStart(idx)
		const length =
			lineId > 0
				? cursor.lines.getLineLengthById(lineId)
				: cursor.lines.getLineLength(idx)
		const text = lineText()
		if (
			prev &&
			prev.lineId === lineId &&
			prev.length === length &&
			prev.text === text
		) {
			if (prev.index !== idx) prev.index = idx
			if (prev.start !== start) prev.start = start
			return prev
		}
		return {
			lineId,
			index: idx,
			start,
			length,
			text,
		}
	})

	let lastHighlightEntry: LineEntry | null = null
	let lastHighlightRevision = -1

	const highlights = createMemo(
		(previous) => {
			const e = entry()
			if (!e) {
				lastHighlightEntry = null
				return undefined
			}

			const revision = local.highlightRevision?.() ?? 0
			if (
				previous &&
				lastHighlightEntry &&
				lastHighlightRevision === revision &&
				lastHighlightEntry.lineId === e.lineId &&
				lastHighlightEntry.length === e.length &&
				lastHighlightEntry.text === e.text &&
				lastHighlightEntry.start !== e.start
			) {
				lastHighlightEntry = e
				return previous
			}

			const next = local.getLineHighlights?.(e)
			lastHighlightEntry = e
			lastHighlightRevision = revision
			return next
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
		const lineId = resolvedLineId()
		return local.getCachedRuns(
			idx,
			local.virtualRow.columnStart,
			local.virtualRow.columnEnd,
			lineId
		)
	})

	const renderColumnEnd = createMemo(() => {
		const textLength = lineText().length
		const columnEnd = local.virtualRow.columnEnd
		if (
			textLength <= VIRTUALIZATION_THRESHOLD &&
			textLength > columnEnd
		) {
			return textLength
		}
		return columnEnd
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
				columnEndOverride={renderColumnEnd()}
			/>
		</Show>
	)
}
