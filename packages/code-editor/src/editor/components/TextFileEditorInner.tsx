import { Show, createEffect, on, onCleanup, onMount } from 'solid-js'
import { Lines } from '../line/components/Lines'
import { Cursor } from '../cursor/components/Cursor'
import { SelectionLayer } from '../selection/components/SelectionLayer'
import { LineGutters } from '../line/components/LineGutters'
import { Input } from './Input'
import { DEFAULT_TAB_SIZE, LINE_NUMBER_WIDTH } from '../consts'
import { useCursor } from '../cursor'
import {
	createCursorScrollSync,
	createTextEditorInput,
	createTextEditorLayout,
	createMouseSelection
} from '../hooks'
import type { TextFileEditorProps } from '../types'

export const TextFileEditorInner = (props: TextFileEditorProps) => {
	const cursor = useCursor()
	const cursorState = () => cursor.state
	const cursorActions = cursor.actions
	const lineEntries = cursor.lineEntries
	const pieceTableText = cursor.documentText
	const tabSize = () => props.tabSize?.() ?? DEFAULT_TAB_SIZE

	let scrollElement: HTMLDivElement = null!
	let inputElement: HTMLTextAreaElement = null!

	const isEditable = () => props.document.isEditable()

	const layout = createTextEditorLayout({
		lineEntries,
		cursorState,
		fontSize: () => props.fontSize(),
		fontFamily: () => props.fontFamily(),
		isFileSelected: () => props.isFileSelected(),
		tabSize,
		scrollElement: () => scrollElement
	})

	createEffect(
		on(
			() => props.document.filePath(),
			() => {
				if (scrollElement) {
					scrollElement.scrollTop = 0
					scrollElement.scrollLeft = 0
				}
			}
		)
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
		updatePieceTable: updater => props.document.updatePieceTable(updater),
		pieceTableText,
		isFileSelected: () => props.isFileSelected(),
		isEditable,
		getInputElement: () => inputElement,
		scrollCursorIntoView,
		activeScopes: () => props.activeScopes?.() ?? ['editor', 'global']
	})

	// Mouse selection for drag, double-click (word), triple-click (line)
	const mouseSelection = createMouseSelection({
		scrollElement: () => scrollElement,
		lineEntries,
		charWidth: layout.charWidth,
		tabSize: tabSize,
		lineHeight: layout.lineHeight,
		cursorActions
	})

	const handleLineMouseDown = (
		event: MouseEvent,
		lineIndex: number,
		column: number,
		textElement: HTMLElement | null
	) => {
		if (!isEditable()) return
		mouseSelection.handleMouseDown(event, lineIndex, column, textElement)
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
					'font-family': props.fontFamily(),
					'user-select': 'none' // Disable browser text selection
				}}
				onClick={() => input.focusInput()}
			>
				<Input
					inputRef={element => {
						inputElement = element
					}}
					layout={layout}
					isEditable={isEditable}
					onInput={input.handleInput}
					onKeyDown={input.handleKeyDown}
					onKeyUp={input.handleKeyUp}
				/>
				<div
					style={{
						height: `${layout.totalSize()}px`,
						position: 'relative'
					}}
				>
					<SelectionLayer
						selections={() => cursorState().selections}
						lineEntries={lineEntries}
						virtualItems={layout.virtualItems}
						lineHeight={layout.lineHeight}
						lineNumberWidth={LINE_NUMBER_WIDTH}
						paddingLeft={0}
						charWidth={layout.charWidth}
						tabSize={tabSize}
						getColumnOffset={layout.getColumnOffset}
						getLineY={layout.getLineY}
					/>
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
							onRowClick={input.handleRowClick}
							activeLineIndex={layout.activeLineIndex}
						/>

						<Lines
							rows={layout.virtualItems}
							entries={lineEntries}
							contentWidth={layout.contentWidth}
							rowVirtualizer={layout.rowVirtualizer}
							lineHeight={layout.lineHeight}
							charWidth={layout.charWidth}
							tabSize={tabSize}
							onRowClick={input.handleRowClick}
							onPreciseClick={input.handlePreciseClick}
							onMouseDown={handleLineMouseDown}
							activeLineIndex={layout.activeLineIndex}
						/>
					</div>
				</div>
			</div>
		</Show>
	)
}
