/* eslint-disable solid/prefer-for */
import { createVirtualizer } from '@tanstack/solid-virtual'
import { Show, createEffect, createMemo } from 'solid-js'
import { useFs } from '../../fs/context/FsContext'
import {
	createPieceTableSnapshot,
	deleteFromPieceTable,
	getPieceTableLength,
	insertIntoPieceTable
} from '~/utils/pieceTable'
import { VirtualizedRows } from './components'
import { Cursor } from './Cursor'
import {
	COLUMN_CHARS_PER_ITEM,
	HORIZONTAL_VIRTUALIZER_OVERSCAN,
	VERTICAL_VIRTUALIZER_OVERSCAN,
	LINE_NUMBER_WIDTH,
	CONTENT_GAP,
	EDITOR_PADDING_LEFT
} from '../consts'
import {
	estimateColumnWidth,
	estimateLineHeight,
	measureCharWidth
} from '../utils'
import { useCursor } from '../cursor'
import { createKeyRepeat, createCursorScrollSync } from '../hooks'
import type { LineEntry, TextFileEditorProps } from '../types'

type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

export const TextFileEditorInner = (props: TextFileEditorProps) => {
	const [state, { updateSelectedFilePieceTable }] = useFs()
	const cursorCtx = useCursor()
	const cursorState = () => cursorCtx.state
	const cursorActions = cursorCtx.actions
	const lineEntries = cursorCtx.lineEntries
	const pieceTableText = cursorCtx.documentText

	const hasLineEntries = () => lineEntries().length > 0

	// Get active line from cursor state
	const activeLineIndex = createMemo<number | null>(() => {
		const entries = lineEntries()
		if (!entries.length) return null
		return cursorState().position.line
	})

	const maxColumnChunks = createMemo(() => {
		const entries = lineEntries()
		if (!entries.length) return 0
		let max = 0
		for (const entry of entries) {
			const chunks = Math.max(
				1,
				Math.ceil(entry.text.length / COLUMN_CHARS_PER_ITEM)
			)
			if (chunks > max) {
				max = chunks
			}
		}
		return max
	})

	// Measured character width for precise positioning
	const charWidth = createMemo(() =>
		measureCharWidth(props.fontSize(), props.fontFamily())
	)

	let scrollElement: HTMLDivElement | null = null
	let inputElement: HTMLTextAreaElement | null = null

	const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		get count() {
			return lineEntries().length
		},
		get enabled() {
			return props.isFileSelected() && hasLineEntries()
		},
		getScrollElement: () => scrollElement,
		estimateSize: () => estimateLineHeight(props.fontSize()),
		overscan: VERTICAL_VIRTUALIZER_OVERSCAN
	})

	const columnVirtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
		horizontal: true,
		get count() {
			return Math.max(maxColumnChunks(), 1)
		},
		get enabled() {
			return props.isFileSelected() && hasLineEntries()
		},
		getScrollElement: () => scrollElement,
		estimateSize: () => estimateColumnWidth(props.fontSize()),
		overscan: HORIZONTAL_VIRTUALIZER_OVERSCAN
	})

	createEffect(() => {
		props.fontSize()
		props.fontFamily()
		lineEntries()
		queueMicrotask(() => {
			rowVirtualizer.measure()
			columnVirtualizer.measure()
		})
	})

	createEffect(() => {
		if (!props.isFileSelected()) {
			scrollElement = null
		}
	})

	// Reset scroll when switching files
	createEffect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		state.lastKnownFilePath
		if (scrollElement) {
			scrollElement.scrollTop = 0
			scrollElement.scrollLeft = 0
		}
	})

	const virtualItems = () => rowVirtualizer.getVirtualItems()
	const totalSize = () => rowVirtualizer.getTotalSize()
	const columnItems = () => columnVirtualizer.getVirtualItems()
	const columnTotalSize = () => columnVirtualizer.getTotalSize()
	const lineHeightEstimate = createMemo(() =>
		estimateLineHeight(props.fontSize())
	)

	// Scroll sync for keyboard navigation only (not mouse clicks)
	const cursorScroll = createCursorScrollSync({
		scrollElement: () => scrollElement,
		lineHeight: lineHeightEstimate,
		charWidth
	})

	// Helper to scroll cursor into view after keyboard navigation
	const scrollCursorIntoView = () => {
		const pos = cursorState().position
		cursorScroll.scrollToCursor(pos.line, pos.column)
	}

	// Get Y position for a line
	const getLineY = (lineIndex: number): number => {
		return lineIndex * lineHeightEstimate()
	}

	// Get visible line range
	const visibleLineRange = createMemo(() => {
		const items = virtualItems()
		if (items.length === 0) return { start: 0, end: 0 }
		return {
			start: items[0]?.index ?? 0,
			end: items[items.length - 1]?.index ?? 0
		}
	})

	const handleRowClick = (entry: LineEntry) => {
		// Move cursor to end of clicked line (fallback)
		cursorActions.setCursorFromClick(entry.index, entry.text.length)
		focusInput()
	}

	const handlePreciseClick = (lineIndex: number, column: number) => {
		cursorActions.setCursorFromClick(lineIndex, column)
		focusInput()
	}

	const focusInput = () => {
		if (inputElement) {
			try {
				inputElement.focus({ preventScroll: true })
			} catch {
				inputElement.focus()
			}
		}
	}

	const applyInsert = (value: string) => {
		if (!value) return
		const offset = cursorState().position.offset
		updateSelectedFilePieceTable(current => {
			const baseSnapshot = current ?? createPieceTableSnapshot(pieceTableText())
			return insertIntoPieceTable(baseSnapshot, offset, value)
		})
		cursorActions.setCursorOffset(offset + value.length)
		scrollCursorIntoView()
	}

	const applyDelete = (offset: number, length: number) => {
		if (length <= 0 || offset < 0) return
		updateSelectedFilePieceTable(current => {
			const baseSnapshot = current ?? createPieceTableSnapshot(pieceTableText())
			const totalLength = getPieceTableLength(baseSnapshot)

			if (offset < 0 || offset >= totalLength) {
				return baseSnapshot
			}

			const clampedLength = Math.max(0, Math.min(length, totalLength - offset))

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

	// Key repeat with acceleration for arrow keys
	const keyRepeat = createKeyRepeat<ArrowKey>((key, ctrlOrMeta) => {
		switch (key) {
			case 'ArrowLeft':
				cursorActions.moveCursor('left', ctrlOrMeta)
				break
			case 'ArrowRight':
				cursorActions.moveCursor('right', ctrlOrMeta)
				break
			case 'ArrowUp':
				cursorActions.moveCursor('up')
				break
			case 'ArrowDown':
				cursorActions.moveCursor('down')
				break
		}
		scrollCursorIntoView()
	})

	const handleKeyDown = (event: KeyboardEvent) => {
		const ctrlOrMeta = event.ctrlKey || event.metaKey

		// Backspace
		if (event.key === 'Backspace') {
			event.preventDefault()
			const offset = cursorState().position.offset
			if (offset === 0) return
			applyDelete(offset - 1, 1)
			cursorActions.setCursorOffset(offset - 1)
			scrollCursorIntoView()
			return
		}

		// Delete
		if (event.key === 'Delete') {
			event.preventDefault()
			const offset = cursorState().position.offset
			applyDelete(offset, 1)
			return
		}

		// Arrow keys with acceleration
		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			event.preventDefault()
			// Only start new repeat if this isn't a browser repeat event
			if (!event.repeat && !keyRepeat.isActive(event.key)) {
				keyRepeat.start(event.key, ctrlOrMeta)
			}
			return
		}

		// Home
		if (event.key === 'Home') {
			event.preventDefault()
			cursorActions.moveCursorHome(ctrlOrMeta)
			scrollCursorIntoView()
			return
		}

		// End
		if (event.key === 'End') {
			event.preventDefault()
			cursorActions.moveCursorEnd(ctrlOrMeta)
			scrollCursorIntoView()
			return
		}

		// Page Up
		if (event.key === 'PageUp') {
			event.preventDefault()
			const visibleLines = visibleLineRange().end - visibleLineRange().start
			cursorActions.moveCursorByLines(-visibleLines)
			scrollCursorIntoView()
			return
		}

		// Page Down
		if (event.key === 'PageDown') {
			event.preventDefault()
			const visibleLines = visibleLineRange().end - visibleLineRange().start
			cursorActions.moveCursorByLines(visibleLines)
			scrollCursorIntoView()
			return
		}
	}

	const handleKeyUp = (event: KeyboardEvent) => {
		// Stop repeat when arrow key is released
		if (
			event.key === 'ArrowLeft' ||
			event.key === 'ArrowRight' ||
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown'
		) {
			if (keyRepeat.isActive(event.key)) {
				keyRepeat.stop()
			}
		}
	}

	return (
		<Show
			when={hasLineEntries()}
			fallback={
				<p class="mt-4 text-sm text-zinc-500">
					Line information is not available for this file yet.
				</p>
			}
		>
			<div
				ref={element => {
					scrollElement = element
				}}
				class="relative mt-4 flex-1 overflow-auto rounded border border-zinc-800/70 bg-zinc-950/30"
				style={{
					'font-size': `${props.fontSize()}px`,
					'font-family': props.fontFamily()
				}}
				onClick={() => focusInput()}
			>
				<textarea
					ref={element => {
						inputElement = element
					}}
					class="absolute left-0 top-0 h-0 w-0 opacity-0"
					autocomplete="off"
					autocorrect="off"
					spellcheck={false}
					onInput={event => handleInput(event as unknown as InputEvent)}
					onKeyDown={event => handleKeyDown(event as unknown as KeyboardEvent)}
					onKeyUp={event => handleKeyUp(event as unknown as KeyboardEvent)}
				/>
				<div
					style={{
						height: `${totalSize()}px`,
						position: 'relative'
					}}
				>
					<Cursor
						cursorState={cursorState}
						fontSize={props.fontSize()}
						fontFamily={props.fontFamily()}
						charWidth={charWidth()}
						lineNumberWidth={LINE_NUMBER_WIDTH + CONTENT_GAP}
						paddingLeft={EDITOR_PADDING_LEFT}
						visibleLineStart={visibleLineRange().start}
						visibleLineEnd={visibleLineRange().end}
						getLineY={getLineY}
					/>
					<VirtualizedRows
						rows={virtualItems}
						columns={columnItems}
						entries={lineEntries}
						totalColumnWidth={columnTotalSize}
						rowVirtualizer={rowVirtualizer}
						lineHeight={lineHeightEstimate}
						fontSize={props.fontSize}
						fontFamily={props.fontFamily}
						onRowClick={handleRowClick}
						onPreciseClick={handlePreciseClick}
						activeLineIndex={activeLineIndex}
					/>
				</div>
			</div>
		</Show>
	)
}
