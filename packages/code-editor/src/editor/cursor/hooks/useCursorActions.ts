import type { Accessor } from 'solid-js'
import type { CursorPosition, CursorState, CursorDirection } from '../types'
import {
	createCursorPosition,
	createDefaultCursorState,
	createSelectionRange,
	getSelectionBounds,
	hasSelection,
} from '../types'
import { getSelectionAnchor } from '../utils/selection'
import {
	getLineLength,
	getLineStart,
	getLineTextLength,
	offsetToPosition,
	positionToOffset,
} from '../utils/position'
import {
	moveCursorLeft,
	moveCursorRight,
	moveVertically,
	moveByLines,
	moveToLineStart,
	moveToLineEnd,
	moveToDocStart,
	moveToDocEnd,
} from '../utils/movement'
import { moveByWord, isWordChar } from '../utils/wordMovement'
import type { CursorActions } from '../context/types'

type UseCursorActionsOptions = {
	currentState: Accessor<CursorState>
	updateCurrentState: (
		updater: (prev: CursorState) => Partial<CursorState>
	) => void
	lineStarts: () => number[]
	getTextRange: (start: number, end: number) => string
	documentLength: () => number
}

export function useCursorActions(
	options: UseCursorActionsOptions
): CursorActions {
	const withActiveCursor = (updates: Partial<CursorState>) => ({
		...updates,
		hasCursor: true,
	})

	const setCursorPosition = (position: CursorPosition) => {
		options.updateCurrentState(() =>
			withActiveCursor({
				position,
				preferredColumn: position.column,
				selections: [],
			})
		)
	}

	const ensureLineStarts = () => options.lineStarts()

	const getShiftAnchor = (shiftKey: boolean, state: CursorState): number =>
		shiftKey ? getSelectionAnchor(state) : state.position.offset

	return {
		setCursor: (position: CursorPosition) => {
			setCursorPosition(position)
		},

		setCursorOffset: (offset: number) => {
			const lineStarts = ensureLineStarts()
			const length = options.documentLength()
			const position = offsetToPosition(offset, lineStarts, length)
			setCursorPosition(position)
		},

		moveCursor: (
			direction: CursorDirection,
			ctrlKey = false,
			shiftKey = false
		) => {
			const state = options.currentState()
			if (!state.hasCursor) return
			const lineStarts = ensureLineStarts()
			const docLength = options.documentLength()
			const anchor = getShiftAnchor(shiftKey, state)

			let newPosition: CursorPosition
			let preferredColumn: number

			if (direction === 'left') {
				newPosition = ctrlKey
					? moveByWord(
							state.position,
							'left',
							options.getTextRange,
							docLength,
							lineStarts
						)
					: moveCursorLeft(state.position, lineStarts, docLength)
				preferredColumn = newPosition.column
			} else if (direction === 'right') {
				newPosition = ctrlKey
					? moveByWord(
							state.position,
							'right',
							options.getTextRange,
							docLength,
							lineStarts
						)
					: moveCursorRight(state.position, docLength, lineStarts)
				preferredColumn = newPosition.column
			} else {
				const verticalMove = moveVertically(
					state.position,
					direction,
					state.preferredColumn,
					lineStarts,
					docLength
				)
				newPosition = verticalMove.position
				preferredColumn = verticalMove.preferredColumn
			}

			options.updateCurrentState(() =>
				withActiveCursor({
					position: newPosition,
					preferredColumn,
					selections: shiftKey
						? [createSelectionRange(anchor, newPosition.offset)]
						: [],
				})
			)
		},

		moveCursorByLines: (delta: number, shiftKey = false) => {
			const state = options.currentState()
			if (!state.hasCursor) return
			const lineStarts = ensureLineStarts()
			const docLength = options.documentLength()
			const anchor = getShiftAnchor(shiftKey, state)

			const result = moveByLines(
				state.position,
				delta,
				state.preferredColumn,
				lineStarts,
				docLength
			)

			options.updateCurrentState(() =>
				withActiveCursor({
					position: result.position,
					preferredColumn: result.preferredColumn,
					selections: shiftKey
						? [createSelectionRange(anchor, result.position.offset)]
						: [],
				})
			)
		},

		moveCursorHome: (ctrlKey = false, shiftKey = false) => {
			const state = options.currentState()
			if (!state.hasCursor) return
			const lineStarts = ensureLineStarts()
			const anchor = getShiftAnchor(shiftKey, state)

			const newPosition = ctrlKey
				? moveToDocStart()
				: moveToLineStart(state.position, lineStarts)

			options.updateCurrentState(() =>
				withActiveCursor({
					position: newPosition,
					preferredColumn: newPosition.column,
					selections: shiftKey
						? [createSelectionRange(anchor, newPosition.offset)]
						: [],
				})
			)
		},

		moveCursorEnd: (ctrlKey = false, shiftKey = false) => {
			const state = options.currentState()
			if (!state.hasCursor) return
			const lineStarts = ensureLineStarts()
			const docLength = options.documentLength()
			const anchor = getShiftAnchor(shiftKey, state)

			const newPosition = ctrlKey
				? moveToDocEnd(lineStarts, docLength)
				: moveToLineEnd(state.position, lineStarts, docLength)

			options.updateCurrentState(() =>
				withActiveCursor({
					position: newPosition,
					preferredColumn: newPosition.column,
					selections: shiftKey
						? [createSelectionRange(anchor, newPosition.offset)]
						: [],
				})
			)
		},

		setCursorFromClick: (
			lineIndex: number,
			column: number,
			shiftKey = false
		) => {
			const lineStarts = ensureLineStarts()
			if (lineStarts.length === 0) return

			const state = options.currentState()
			const anchor = getShiftAnchor(shiftKey, state)
			const clampedLineIndex = Math.max(
				0,
				Math.min(lineIndex, lineStarts.length - 1)
			)

			const docLength = options.documentLength()
			const textLength = getLineTextLength(clampedLineIndex, lineStarts, docLength)
			const clampedColumn = Math.max(0, Math.min(column, textLength))
			const offset = positionToOffset(
				clampedLineIndex,
				clampedColumn,
				lineStarts,
				docLength
			)
			const position = createCursorPosition(
				offset,
				clampedLineIndex,
				clampedColumn
			)

			options.updateCurrentState(() =>
				withActiveCursor({
					position,
					preferredColumn: clampedColumn,
					selections: shiftKey ? [createSelectionRange(anchor, offset)] : [],
				})
			)
		},

		resetCursor: () => {
			options.updateCurrentState(() => createDefaultCursorState())
		},

		setBlinking: (blinking: boolean) => {
			options.updateCurrentState(() => ({
				isBlinking: blinking,
			}))
		},

		setSelection: (anchor: number, focus: number) => {
			const lineStarts = ensureLineStarts()
			const docLength = options.documentLength()
			const position = offsetToPosition(focus, lineStarts, docLength)

			options.updateCurrentState(() =>
				withActiveCursor({
					position,
					preferredColumn: position.column,
					selections: [createSelectionRange(anchor, focus)],
				})
			)
		},

		clearSelection: () => {
			options.updateCurrentState(() => ({
				selections: [],
			}))
		},

		selectAll: () => {
			const lineStarts = ensureLineStarts()
			const length = options.documentLength()
			const position = offsetToPosition(length, lineStarts, length)

			options.updateCurrentState(() =>
				withActiveCursor({
					position,
					preferredColumn: position.column,
					selections: [createSelectionRange(0, length)],
				})
			)
		},

		selectWord: (offset: number) => {
			const lineStarts = ensureLineStarts()
			const maxLength = options.documentLength()
			const clampedOffset = Math.min(Math.max(0, offset), maxLength)

			let start = clampedOffset
			let end = clampedOffset

			const chunkSize = 4096

			let leftEnd = start
			while (leftEnd > 0) {
				const leftStart = Math.max(0, leftEnd - chunkSize)
				const chunk = options.getTextRange(leftStart, leftEnd)
				let i = leftEnd - leftStart

				while (i > 0 && isWordChar(chunk[i - 1]!)) {
					i--
				}

				start = leftStart + i

				if (i > 0 || leftStart === 0) {
					break
				}

				leftEnd = leftStart
			}

			let rightStart = end
			while (rightStart < maxLength) {
				const rightEnd = Math.min(maxLength, rightStart + chunkSize)
				const chunk = options.getTextRange(rightStart, rightEnd)
				let i = 0

				while (i < chunk.length && isWordChar(chunk[i]!)) {
					i++
				}

				end = rightStart + i

				if (i < chunk.length || rightEnd === maxLength) {
					break
				}

				rightStart = rightEnd
			}

			if (start === end && end < maxLength) {
				end += 1
			}

			const position = offsetToPosition(end, lineStarts, maxLength)

			options.updateCurrentState(() =>
				withActiveCursor({
					position,
					preferredColumn: position.column,
					selections: [createSelectionRange(start, end)],
				})
			)
		},

		selectLine: (lineIndex: number) => {
			const lineStarts = ensureLineStarts()
			if (lineIndex < 0 || lineIndex >= lineStarts.length) return

			const docLength = options.documentLength()
			const start = getLineStart(lineIndex, lineStarts)
			const end = start + getLineLength(lineIndex, lineStarts, docLength)
			const position = offsetToPosition(end, lineStarts, docLength)

			options.updateCurrentState(() =>
				withActiveCursor({
					position,
					preferredColumn: position.column,
					selections: [createSelectionRange(start, end)],
				})
			)
		},

		getSelectedText: () => {
			const state = options.currentState()
			if (state.selections.length === 0) return ''

			const selection = state.selections[0]
			if (!selection) return ''

			const { start, end } = getSelectionBounds(selection)
			return options.getTextRange(start, end)
		},

		getSelection: () => {
			const selection = options.currentState().selections[0]
			return selection ?? null
		},

		hasSelection: () => {
			return hasSelection(options.currentState())
		},
	}
}
