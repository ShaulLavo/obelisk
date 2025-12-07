import type { Accessor } from 'solid-js'
import type { LineEntry } from '../../types'
import type {
	CursorPosition,
	CursorState,
	CursorDirection
} from '../types'
import {
	createCursorPosition,
	createDefaultCursorState,
	createSelectionRange,
	getSelectionBounds,
	hasSelection
} from '../types'
import { getSelectionAnchor } from '../utils/selection'
import { offsetToPosition, positionToOffset } from '../utils/position'
import {
	moveCursorLeft,
	moveCursorRight,
	moveVertically,
	moveByLines,
	moveToLineStart,
	moveToLineEnd,
	moveToDocStart,
	moveToDocEnd
} from '../utils/movement'
import { moveByWord, isWordChar } from '../utils/wordMovement'
import type { CursorActions } from '../context/types'

type UseCursorActionsOptions = {
	currentState: Accessor<CursorState>
	updateCurrentState: (
		updater: (prev: CursorState) => Partial<CursorState>
	) => void
	lineEntries: () => LineEntry[]
	documentText: () => string
	documentLength: () => number
}

export function useCursorActions(
	options: UseCursorActionsOptions
): CursorActions {
	const setCursorPosition = (position: CursorPosition) => {
		options.updateCurrentState(() => ({
			position,
			preferredColumn: position.column,
			selections: []
		}))
	}

	const ensureEntries = () => options.lineEntries()

	const getShiftAnchor = (shiftKey: boolean, state: CursorState): number =>
		shiftKey ? getSelectionAnchor(state) : state.position.offset

	return {
		setCursor: (position: CursorPosition) => {
			setCursorPosition(position)
		},

		setCursorOffset: (offset: number) => {
			const position = offsetToPosition(offset, ensureEntries())
			setCursorPosition(position)
		},

		moveCursor: (
			direction: CursorDirection,
			ctrlKey = false,
			shiftKey = false
		) => {
			const state = options.currentState()
			const entries = ensureEntries()
			const anchor = getShiftAnchor(shiftKey, state)

			let newPosition: CursorPosition
			let preferredColumn: number

			if (direction === 'left') {
				newPosition = ctrlKey
					? moveByWord(state.position, 'left', options.documentText(), entries)
					: moveCursorLeft(state.position, entries)
				preferredColumn = newPosition.column
			} else if (direction === 'right') {
				newPosition = ctrlKey
					? moveByWord(state.position, 'right', options.documentText(), entries)
					: moveCursorRight(state.position, options.documentLength(), entries)
				preferredColumn = newPosition.column
			} else {
				const verticalMove = moveVertically(
					state.position,
					direction,
					state.preferredColumn,
					entries
				)
				newPosition = verticalMove.position
				preferredColumn = verticalMove.preferredColumn
			}

			options.updateCurrentState(() => ({
				position: newPosition,
				preferredColumn,
				selections: shiftKey
					? [createSelectionRange(anchor, newPosition.offset)]
					: []
			}))
		},

		moveCursorByLines: (delta: number, shiftKey = false) => {
			const state = options.currentState()
			const entries = ensureEntries()
			const anchor = getShiftAnchor(shiftKey, state)

			const result = moveByLines(
				state.position,
				delta,
				state.preferredColumn,
				entries
			)

			options.updateCurrentState(() => ({
				position: result.position,
				preferredColumn: result.preferredColumn,
				selections: shiftKey
					? [createSelectionRange(anchor, result.position.offset)]
					: []
			}))
		},

		moveCursorHome: (ctrlKey = false, shiftKey = false) => {
			const state = options.currentState()
			const entries = ensureEntries()
			const anchor = getShiftAnchor(shiftKey, state)

			const newPosition = ctrlKey
				? moveToDocStart()
				: moveToLineStart(state.position, entries)

			options.updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPosition.column,
				selections: shiftKey
					? [createSelectionRange(anchor, newPosition.offset)]
					: []
			}))
		},

		moveCursorEnd: (ctrlKey = false, shiftKey = false) => {
			const state = options.currentState()
			const entries = ensureEntries()
			const anchor = getShiftAnchor(shiftKey, state)

			const newPosition = ctrlKey
				? moveToDocEnd(entries)
				: moveToLineEnd(state.position, entries)

			options.updateCurrentState(() => ({
				position: newPosition,
				preferredColumn: newPosition.column,
				selections: shiftKey
					? [createSelectionRange(anchor, newPosition.offset)]
					: []
			}))
		},

		setCursorFromClick: (
			lineIndex: number,
			column: number,
			shiftKey = false
		) => {
			const entries = ensureEntries()
			if (entries.length === 0) return

			const state = options.currentState()
			const anchor = getShiftAnchor(shiftKey, state)
			const clampedLineIndex = Math.max(
				0,
				Math.min(lineIndex, entries.length - 1)
			)
			const entry = entries[clampedLineIndex]!

			const clampedColumn = Math.max(0, Math.min(column, entry.text.length))
			const offset = positionToOffset(clampedLineIndex, clampedColumn, entries)
			const position = createCursorPosition(
				offset,
				clampedLineIndex,
				clampedColumn
			)

			options.updateCurrentState(() => ({
				position,
				preferredColumn: clampedColumn,
				selections: shiftKey ? [createSelectionRange(anchor, offset)] : []
			}))
		},

		resetCursor: () => {
			options.updateCurrentState(() => createDefaultCursorState())
		},

		setBlinking: (blinking: boolean) => {
			options.updateCurrentState(() => ({
				isBlinking: blinking
			}))
		},

		setSelection: (anchor: number, focus: number) => {
			const entries = ensureEntries()
			const position = offsetToPosition(focus, entries)

			options.updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(anchor, focus)]
			}))
		},

		clearSelection: () => {
			options.updateCurrentState(() => ({
				selections: []
			}))
		},

		selectAll: () => {
			const entries = ensureEntries()
			const length = options.documentLength()
			const position = offsetToPosition(length, entries)

			options.updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(0, length)]
			}))
		},

		selectWord: (offset: number) => {
			const text = options.documentText()
			const entries = ensureEntries()

			let start = offset
			let end = offset

			while (start > 0) {
				const char = text[start - 1]
				if (!char || !isWordChar(char)) break
				start--
			}

			while (end < text.length) {
				const char = text[end]
				if (!char || !isWordChar(char)) break
				end++
			}

			if (start === end && end < text.length) {
				end++
			}

			const position = offsetToPosition(end, entries)

			options.updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(start, end)]
			}))
		},

		selectLine: (lineIndex: number) => {
			const entries = ensureEntries()
			if (lineIndex < 0 || lineIndex >= entries.length) return

			const entry = entries[lineIndex]
			if (!entry) return

			const start = entry.start
			const end = entry.start + entry.length
			const position = offsetToPosition(end, entries)

			options.updateCurrentState(() => ({
				position,
				preferredColumn: position.column,
				selections: [createSelectionRange(start, end)]
			}))
		},

		getSelectedText: () => {
			const state = options.currentState()
			if (state.selections.length === 0) return ''

			const selection = state.selections[0]
			if (!selection) return ''

			const { start, end } = getSelectionBounds(selection)
			return options.documentText().slice(start, end)
		},

		getSelection: () => {
			const selection = options.currentState().selections[0]
			return selection ?? null
		},

		hasSelection: () => {
			return hasSelection(options.currentState())
		}
	}
}
