import { createEffect, type Accessor } from 'solid-js'
import type { PieceTableSnapshot } from '~/utils/pieceTable'
import {
	createPieceTableSnapshot,
	deleteFromPieceTable,
	getPieceTableLength,
	insertIntoPieceTable
} from '~/utils/pieceTable'
import type { LineEntry } from '../types'
import type { CursorState, CursorActions } from '../cursor'
import { createKeyRepeat } from './createKeyRepeat'

type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

type VisibleLineRange = {
	start: number
	end: number
}

export type TextEditorInputOptions = {
	cursorState: Accessor<CursorState>
	cursorActions: CursorActions
	visibleLineRange: Accessor<VisibleLineRange>
	updateSelectedFilePieceTable: (
		updater: (
			current: PieceTableSnapshot | undefined
		) => PieceTableSnapshot | undefined
	) => void
	pieceTableText: () => string
	isFileSelected: Accessor<boolean>
	getInputElement: () => HTMLTextAreaElement | null
	scrollCursorIntoView: () => void
}

export type TextEditorInputHandlers = {
	handleInput: (event: InputEvent) => void
	handleKeyDown: (event: KeyboardEvent) => void
	handleKeyUp: (event: KeyboardEvent) => void
	handleRowClick: (entry: LineEntry) => void
	handlePreciseClick: (lineIndex: number, column: number) => void
	focusInput: () => void
}

export function createTextEditorInput(
	options: TextEditorInputOptions
): TextEditorInputHandlers {
	const focusInput = () => {
		const element = options.getInputElement()
		if (!element) return
		try {
			element.focus({ preventScroll: true })
		} catch {
			element.focus()
		}
	}

	createEffect(() => {
		if (options.isFileSelected()) {
			focusInput()
		}
	})

	const applyInsert = (value: string) => {
		if (!value) return
		const offset = options.cursorState().position.offset
		options.updateSelectedFilePieceTable(current => {
			const baseSnapshot =
				current ?? createPieceTableSnapshot(options.pieceTableText())
			return insertIntoPieceTable(baseSnapshot, offset, value)
		})
		options.cursorActions.setCursorOffset(offset + value.length)
		options.scrollCursorIntoView()
	}

	const applyDelete = (offset: number, length: number) => {
		if (length <= 0 || offset < 0) return
		options.updateSelectedFilePieceTable(current => {
			const baseSnapshot =
				current ?? createPieceTableSnapshot(options.pieceTableText())
			const totalLength = getPieceTableLength(baseSnapshot)

			if (offset >= totalLength) {
				return baseSnapshot
			}

			const clampedLength = Math.max(
				0,
				Math.min(length, totalLength - offset)
			)

			if (clampedLength === 0) {
				return baseSnapshot
			}

			return deleteFromPieceTable(baseSnapshot, offset, clampedLength)
		})
	}

	const handleInput = (event: InputEvent) => {
		const target = event.target as HTMLTextAreaElement | null
		if (!target) return
		const value = target.value
		if (!value) return
		applyInsert(value)
		target.value = ''
	}

	const keyRepeat = createKeyRepeat<ArrowKey>((key, ctrlOrMeta) => {
		switch (key) {
			case 'ArrowLeft':
				options.cursorActions.moveCursor('left', ctrlOrMeta)
				break
			case 'ArrowRight':
				options.cursorActions.moveCursor('right', ctrlOrMeta)
				break
			case 'ArrowUp':
				options.cursorActions.moveCursor('up')
				break
			case 'ArrowDown':
				options.cursorActions.moveCursor('down')
				break
		}
		options.scrollCursorIntoView()
	})

	const handleKeyDown = (event: KeyboardEvent) => {
		const ctrlOrMeta = event.ctrlKey || event.metaKey

		if (event.key === 'Backspace') {
			event.preventDefault()
			const offset = options.cursorState().position.offset
			if (offset === 0) return
			applyDelete(offset - 1, 1)
			options.cursorActions.setCursorOffset(offset - 1)
			options.scrollCursorIntoView()
			return
		}

		if (event.key === 'Delete') {
			event.preventDefault()
			const offset = options.cursorState().position.offset
			applyDelete(offset, 1)
			options.scrollCursorIntoView()
			return
		}

		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			event.preventDefault()
			if (!event.repeat && !keyRepeat.isActive(event.key as ArrowKey)) {
				keyRepeat.start(event.key as ArrowKey, ctrlOrMeta)
			}
			return
		}

		if (event.key === 'Home') {
			event.preventDefault()
			options.cursorActions.moveCursorHome(ctrlOrMeta)
			options.scrollCursorIntoView()
			return
		}

		if (event.key === 'End') {
			event.preventDefault()
			options.cursorActions.moveCursorEnd(ctrlOrMeta)
			options.scrollCursorIntoView()
			return
		}

		if (event.key === 'PageUp') {
			event.preventDefault()
			const range = options.visibleLineRange()
			const visibleLines = range.end - range.start
			options.cursorActions.moveCursorByLines(-visibleLines)
			options.scrollCursorIntoView()
			return
		}

		if (event.key === 'PageDown') {
			event.preventDefault()
			const range = options.visibleLineRange()
			const visibleLines = range.end - range.start
			options.cursorActions.moveCursorByLines(visibleLines)
			options.scrollCursorIntoView()
			return
		}
	}

	const handleKeyUp = (event: KeyboardEvent) => {
		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			if (keyRepeat.isActive(event.key as ArrowKey)) {
				keyRepeat.stop()
			}
		}
	}

	const handleRowClick = (entry: LineEntry) => {
		options.cursorActions.setCursorFromClick(entry.index, entry.text.length)
		focusInput()
	}

	const handlePreciseClick = (lineIndex: number, column: number) => {
		options.cursorActions.setCursorFromClick(lineIndex, column)
		focusInput()
	}

	return {
		handleInput,
		handleKeyDown,
		handleKeyUp,
		handleRowClick,
		handlePreciseClick,
		focusInput
	}
}
