import type { JSX } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { PieceTableSnapshot } from '@repo/utils'
import type {
	CursorPosition,
	CursorState,
	CursorDirection,
	SelectionRange,
} from '../types'

export type CursorActions = {
	// Cursor positioning
	setCursor: (position: CursorPosition) => void
	setCursorOffset: (offset: number) => void
	moveCursor: (
		direction: CursorDirection,
		ctrlKey?: boolean,
		shiftKey?: boolean
	) => void
	moveCursorByLines: (delta: number, shiftKey?: boolean) => void
	moveCursorHome: (ctrlKey?: boolean, shiftKey?: boolean) => void
	moveCursorEnd: (ctrlKey?: boolean, shiftKey?: boolean) => void
	setCursorFromClick: (
		lineIndex: number,
		column: number,
		shiftKey?: boolean
	) => void
	resetCursor: () => void
	setBlinking: (blinking: boolean) => void

	// Selection actions
	setSelection: (anchor: number, focus: number) => void
	clearSelection: () => void
	selectAll: () => void
	selectWord: (offset: number) => void
	selectLine: (lineIndex: number) => void
	getSelectedText: () => string
	getSelection: () => SelectionRange | null
	hasSelection: () => boolean
}

export type CursorContextValue = {
	state: CursorState
	actions: CursorActions
	lines: {
		lineStarts: Accessor<number[]>
		lineCount: Accessor<number>
		getLineStart: (lineIndex: number) => number
		getLineLength: (lineIndex: number) => number
		getLineTextLength: (lineIndex: number) => number
		getLineText: (lineIndex: number) => string
		offsetToPosition: (offset: number) => CursorPosition
		positionToOffset: (line: number, column: number) => number
		applyEdit: (
			startIndex: number,
			deletedText: string,
			insertedText: string
		) => void
	}
	getTextRange: (start: number, end: number) => string
	documentLength: Accessor<number>
}

export type CursorProviderProps = {
	children: JSX.Element
	filePath: () => string | undefined
	isFileSelected: () => boolean
	content: () => string
	pieceTable: () => PieceTableSnapshot | undefined
}
