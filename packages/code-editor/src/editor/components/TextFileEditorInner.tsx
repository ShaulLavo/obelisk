import {
	Show,
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
	type Accessor
} from 'solid-js'
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
import type {
	BracketDepthMap,
	LineHighlightSegment,
	TextFileEditorProps
} from '../types'

type TextFileEditorInnerProps = TextFileEditorProps & {
	bracketDepths: Accessor<BracketDepthMap | undefined>
	getLineHighlights: (index: number) => LineHighlightSegment[] | undefined
}

export const TextFileEditorInner = (props: TextFileEditorInnerProps) => {
	const cursor = useCursor()

	const tabSize = () => props.tabSize?.() ?? DEFAULT_TAB_SIZE

	let scrollElement: HTMLDivElement = null!
	let inputElement: HTMLTextAreaElement = null!

	const isEditable = () => props.document.isEditable()

	const layout = createTextEditorLayout({
		fontSize: () => props.fontSize(),
		fontFamily: () => props.fontFamily(),
		isFileSelected: () => props.isFileSelected(),
		tabSize,
		scrollElement: () => scrollElement
	})

	const cursorScroll = createCursorScrollSync({
		scrollElement: () => scrollElement,
		lineHeight: layout.lineHeight,
		charWidth: layout.charWidth,
		getColumnOffset: layout.getColumnOffset
	})

	const scrollCursorIntoView = () => {
		const pos = cursor.state.position
		cursorScroll.scrollToCursor(pos.line, pos.column)
	}

	const input = createTextEditorInput({
		visibleLineRange: layout.visibleLineRange,
		updatePieceTable: updater => props.document.updatePieceTable(updater),
		isFileSelected: () => props.isFileSelected(),
		isEditable,
		getInputElement: () => inputElement,
		scrollCursorIntoView,
		activeScopes: () => props.activeScopes?.() ?? ['editor', 'global'],
		onIncrementalEdit: edit => props.document.applyIncrementalEdit?.(edit)
	})

	const mouseSelection = createMouseSelection({
		scrollElement: () => scrollElement,
		charWidth: layout.charWidth,
		tabSize: tabSize,
		lineHeight: layout.lineHeight
	})

	const [foldedStarts, setFoldedStarts] = createSignal<Set<number>>(new Set())

	const toggleFold = (startLine: number) => {
		const foldRanges = props.folds?.()
		if (
			!foldRanges?.some(
				range =>
					range.startLine === startLine && range.endLine > range.startLine
			)
		) {
			return
		}

		setFoldedStarts(prev => {
			const next = new Set(prev)
			if (next.has(startLine)) {
				next.delete(startLine)
			} else {
				next.add(startLine)
			}
			return next
		})
	}

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

	createEffect(
		on(
			() => props.document.filePath(),
			() => {
				if (scrollElement) {
					scrollElement.scrollTop = 0
					scrollElement.scrollLeft = 0
				}
				setFoldedStarts(new Set<number>())
			}
		)
	)
	createEffect(
		on(
			() => props.folds?.(),
			folds => {
				setFoldedStarts(prev => {
					if (!folds?.length) return new Set<number>()
					const next = new Set<number>()
					for (const fold of folds) {
						if (fold.endLine > fold.startLine && prev.has(fold.startLine)) {
							next.add(fold.startLine)
						}
					}
					return next
				})
			}
		)
	)
	onMount(() => {
		if (!scrollElement) return
		const unregister = props.registerEditorArea?.(() => scrollElement)
		if (typeof unregister === 'function') {
			onCleanup(unregister)
		}
	})

	/* TODO: move off TanStack virtualization so we control windowing
		and can let features like bracket coloring share the custom
		visible-range state
		And we can not read ALL the text at once from the piece table
		just the needed chunks
		*/
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
				class="relative  flex-1 overflow-auto   bg-zinc-950/30"
				style={{
					'font-size': `${props.fontSize()}px`,
					'font-family': props.fontFamily(),
					'user-select': 'none'
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
							lineHeight={layout.lineHeight}
							onRowClick={input.handleRowClick}
							activeLineIndex={layout.activeLineIndex}
							folds={props.folds}
							foldedStarts={foldedStarts}
							onToggleFold={toggleFold}
						/>

						<Lines
							rows={layout.virtualItems}
							contentWidth={layout.contentWidth}
							rowVirtualizer={layout.rowVirtualizer}
							lineHeight={layout.lineHeight}
							charWidth={layout.charWidth}
							tabSize={tabSize}
							isEditable={isEditable}
							onRowClick={input.handleRowClick}
							onPreciseClick={input.handlePreciseClick}
							onMouseDown={handleLineMouseDown}
							activeLineIndex={layout.activeLineIndex}
							bracketDepths={props.bracketDepths}
							getLineHighlights={props.getLineHighlights}
						/>
					</div>
				</div>
			</div>
		</Show>
	)
}
