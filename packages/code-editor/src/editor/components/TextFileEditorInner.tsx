import { Show, createEffect, on, onCleanup, onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import { Lines } from './Lines'
import { Cursor } from './Cursor'
import { LineGutters } from './LineGutters'
import { Input } from './Input'
import { DEFAULT_TAB_SIZE, LINE_NUMBER_WIDTH } from '../consts'
import { useCursor } from '../cursor'
import {
	createCursorScrollSync,
	createTextEditorInput,
	createTextEditorLayout
} from '../hooks'
import type { LineEntry, TextFileEditorProps } from '../types'

export const TextFileEditorInner = (props: TextFileEditorProps) => {
	const cursor = useCursor()
	const cursorState = () => cursor.state
	const cursorActions = cursor.actions
	const lineEntries = cursor.lineEntries
	const pieceTableText = cursor.documentText
	const tabSizeAccessor = props.tabSize ?? (() => DEFAULT_TAB_SIZE)

	let scrollElement: HTMLDivElement = null!
	let inputElement: HTMLTextAreaElement = null!

	const isEditable = () => props.document.isEditable()

	const layout = createTextEditorLayout({
		lineEntries,
		cursorState,
		fontSize: () => props.fontSize(),
		fontFamily: () => props.fontFamily(),
		isFileSelected: () => props.isFileSelected(),
		tabSize: tabSizeAccessor,
		scrollElement: () => scrollElement
	})

	createEffect(
		on(() => props.document.filePath(), () => {
			if (scrollElement) {
				scrollElement.scrollTop = 0
				scrollElement.scrollLeft = 0
			}
		})
	)

	const cursorScroll = createCursorScrollSync({
		scrollElement: () => scrollElement,
		lineHeight: layout.lineHeight,
		charWidth: layout.charWidth,
		getColumnOffset: layout.getColumnOffset
	})

	const scrollCursorIntoView = () => {
		const pos = cursorState().position
		cursorScroll.scrollToCursor(pos.line, pos.column)
	}

	const input = createTextEditorInput({
		cursorState,
		cursorActions,
		visibleLineRange: layout.visibleLineRange,
		updatePieceTable: props.document.updatePieceTable,
		pieceTableText,
		isFileSelected: () => props.isFileSelected(),
		getInputElement: () => inputElement,
		scrollCursorIntoView
	})

	const handleInput: JSX.EventHandlerUnion<HTMLTextAreaElement, InputEvent> = event => {
		if (!isEditable()) return
		input.handleInput(event)
	}

	const handleKeyDown: JSX.EventHandlerUnion<
		HTMLTextAreaElement,
		KeyboardEvent
	> = event => {
		if (!isEditable()) return
		input.handleKeyDown(event)
	}

	const handleKeyUp: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent> =
		event => {
			if (!isEditable()) return
			input.handleKeyUp(event)
	}

	const handleRowClick = (entry: LineEntry) => {
		if (!isEditable()) return
		input.handleRowClick(entry)
	}

	const handlePreciseClick = (lineIndex: number, column: number) => {
		if (!isEditable()) return
		input.handlePreciseClick(lineIndex, column)
	}

	const focusInput = () => {
		if (!isEditable()) return
		input.focusInput()
	}

	onMount(() => {
		if (!scrollElement) return
		const unregister = props.registerEditorArea?.(() => scrollElement)
		if (typeof unregister === 'function') {
			onCleanup(unregister)
		}
	})

	return (
		<Show
			when={layout.hasLineEntries()}
			fallback={
				<p class="mt-4 text-sm text-zinc-500">
					Line information is not available for this file yet.
				</p>
			}
		>
			<div
				ref={scrollElement}
				class="relative mt-4 flex-1 overflow-auto rounded border border-zinc-800/70 bg-zinc-950/30"
				style={{
					'font-size': `${props.fontSize()}px`,
					'font-family': props.fontFamily()
				}}
				onClick={() => focusInput()}
			>
				<Input
					inputRef={element => {
						inputElement = element
					}}
					layout={layout}
					isEditable={isEditable}
					onInput={handleInput}
					onKeyDown={handleKeyDown}
					onKeyUp={handleKeyUp}
				/>
				<div
					style={{
						height: `${layout.totalSize()}px`,
						position: 'relative'
					}}
				>
					<Show when={isEditable()}>
						<Cursor
							cursorState={cursorState}
							fontSize={props.fontSize()}
							fontFamily={props.fontFamily()}
							charWidth={layout.charWidth()}
							lineNumberWidth={LINE_NUMBER_WIDTH}
							paddingLeft={0}
							visibleLineStart={layout.visibleLineRange().start}
							visibleLineEnd={layout.visibleLineRange().end}
							getColumnOffset={layout.getColumnOffset}
							getLineY={layout.getLineY}
							cursorMode={props.cursorMode}
						/>
					</Show>
					<div class="flex h-full">
						<LineGutters
							rows={layout.virtualItems}
							entries={lineEntries}
							lineHeight={layout.lineHeight}
							onRowClick={handleRowClick}
							activeLineIndex={layout.activeLineIndex}
						/>

						<Lines
							rows={layout.virtualItems}
							entries={lineEntries}
							contentWidth={layout.contentWidth}
							rowVirtualizer={layout.rowVirtualizer}
							lineHeight={layout.lineHeight}
							charWidth={layout.charWidth}
							tabSize={tabSizeAccessor}
							onRowClick={handleRowClick}
							onPreciseClick={handlePreciseClick}
							activeLineIndex={layout.activeLineIndex}
						/>
					</div>
				</div>
			</div>
		</Show>
	)
}
