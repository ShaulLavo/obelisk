import { Show, createEffect, on } from 'solid-js'
import { useFs } from '../../fs/context/FsContext'
import { Lines } from './Lines'
import { Cursor } from './Cursor'
import { LineGutters } from './LineGutters'
import { LINE_NUMBER_WIDTH, CONTENT_GAP, EDITOR_PADDING_LEFT } from '../consts'
import { useCursor } from '../cursor'
import {
	createCursorScrollSync,
	createTextEditorInput,
	createTextEditorLayout
} from '../hooks'
import type { LineEntry, TextFileEditorProps } from '../types'

export const TextFileEditorInner = (props: TextFileEditorProps) => {
	const [state, { updateSelectedFilePieceTable }] = useFs()
	const cursor = useCursor()
	const cursorState = () => cursor.state
	const cursorActions = cursor.actions
	const lineEntries = cursor.lineEntries
	const pieceTableText = cursor.documentText

	let scrollElement: HTMLDivElement = null!
	let inputElement: HTMLTextAreaElement = null!

	const isEditable = () =>
		props.isFileSelected() && !state.selectedFileLoading && !state.loading

	const layout = createTextEditorLayout({
		lineEntries,
		cursorState,
		fontSize: () => props.fontSize(),
		fontFamily: () => props.fontFamily(),
		isFileSelected: () => props.isFileSelected(),
		scrollElement: () => scrollElement
	})

	createEffect(
		on(
			() => state.lastKnownFilePath,
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
		charWidth: layout.charWidth
	})

	const scrollCursorIntoView = () => {
		const pos = cursorState().position
		cursorScroll.scrollToCursor(pos.line, pos.column)
	}

	const input = createTextEditorInput({
		cursorState,
		cursorActions,
		visibleLineRange: layout.visibleLineRange,
		updateSelectedFilePieceTable,
		pieceTableText,
		isFileSelected: () => props.isFileSelected(),
		getInputElement: () => inputElement,
		scrollCursorIntoView
	})

	const handleInput = (event: InputEvent) => {
		if (!isEditable()) return
		input.handleInput(event)
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		if (!isEditable()) return
		input.handleKeyDown(event)
	}

	const handleKeyUp = (event: KeyboardEvent) => {
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
				<textarea
					ref={inputElement}
					class="absolute opacity-0"
					style={{
						left: `${layout.inputX()}px`,
						top: `${layout.inputY()}px`,
						width: `${layout.charWidth()}px`,
						height: `${layout.lineHeight()}px`
					}}
					autocomplete="off"
					autocorrect="off"
					spellcheck={false}
					disabled={!isEditable()}
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
							lineNumberWidth={LINE_NUMBER_WIDTH + CONTENT_GAP}
							paddingLeft={EDITOR_PADDING_LEFT}
							visibleLineStart={layout.visibleLineRange().start}
							visibleLineEnd={layout.visibleLineRange().end}
							getLineY={layout.getLineY}
							cursorMode={props.cursorMode}
						/>
					</Show>
					<div class="flex h-full">
						<div
							class="sticky left-0 z-10 bg-zinc-950"
							style={{
								width: `${LINE_NUMBER_WIDTH + CONTENT_GAP + EDITOR_PADDING_LEFT}px`
							}}
						>
							<div
								class="relative h-full"
								style={{
									'padding-left': `${EDITOR_PADDING_LEFT}px`
								}}
							>
								<LineGutters
									rows={layout.virtualItems}
									entries={lineEntries}
									lineHeight={layout.lineHeight}
									onRowClick={handleRowClick}
									activeLineIndex={layout.activeLineIndex}
								/>
							</div>
						</div>
						<div class="relative flex-1">
							<Lines
								rows={layout.virtualItems}
								columns={layout.columnItems}
								entries={lineEntries}
								totalColumnWidth={layout.columnTotalSize}
								rowVirtualizer={layout.rowVirtualizer}
								lineHeight={layout.lineHeight}
								fontSize={props.fontSize}
								fontFamily={props.fontFamily}
								onRowClick={handleRowClick}
								onPreciseClick={handlePreciseClick}
								activeLineIndex={layout.activeLineIndex}
							/>
						</div>
					</div>
				</div>
			</div>
		</Show>
	)
}
