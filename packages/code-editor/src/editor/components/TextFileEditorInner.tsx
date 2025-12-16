import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	type Accessor,
} from 'solid-js'
import { Lines } from '../line/components/Lines'
import { Cursor } from '../cursor/components/Cursor'
import { SelectionLayer } from '../selection/components/SelectionLayer'
import { LineGutters } from '../line/components/LineGutters'
import { Input } from './Input'
import { DEFAULT_TAB_SIZE, LINE_NUMBER_WIDTH } from '../consts'
import { useCursor } from '../cursor'
import {
	mergeLineSegments,
	toLineHighlightSegmentsForLine,
	getHighlightClassForScope,
} from '../utils/highlights'
import { quickTokenizeLine, quickTokensToSegments } from '../utils/quickLexer'
import {
	createCursorScrollSync,
	createTextEditorInput,
	createTextEditorLayout,
	createMouseSelection,
} from '../hooks'
import type {
	BracketDepthMap,
	LineEntry,
	LineHighlightSegment,
	TextFileEditorProps,
} from '../types'

type TextFileEditorInnerProps = TextFileEditorProps & {
	bracketDepths: Accessor<BracketDepthMap | undefined>
}

export const TextFileEditorInner = (props: TextFileEditorInnerProps) => {
	const cursor = useCursor()

	const tabSize = () => props.tabSize?.() ?? DEFAULT_TAB_SIZE

	const [scrollElement, setScrollElement] = createSignal<HTMLDivElement | null>(
		null
	)
	let inputElement: HTMLTextAreaElement = null!

	const isEditable = () => props.document.isEditable()

	// Track which fold regions are currently collapsed
	const [foldedStarts, setFoldedStarts] = createSignal<Set<number>>(new Set())

	const layout = createTextEditorLayout({
		fontSize: () => props.fontSize(),
		fontFamily: () => props.fontFamily(),
		isFileSelected: () => props.isFileSelected(),
		tabSize,
		scrollElement,
		folds: () => props.folds?.(),
		foldedStarts,
	})

	const cursorScroll = createCursorScrollSync({
		scrollElement,
		lineHeight: layout.lineHeight,
		charWidth: layout.charWidth,
		getColumnOffset: layout.getColumnOffset,
	})

	const scrollCursorIntoView = () => {
		const pos = cursor.state.position
		cursorScroll.scrollToCursor(pos.line, pos.column)
	}

	const input = createTextEditorInput({
		visibleLineRange: layout.visibleLineRange,
		updatePieceTable: (updater) => props.document.updatePieceTable(updater),
		isFileSelected: () => props.isFileSelected(),
		isEditable,
		getInputElement: () => inputElement,
		scrollCursorIntoView,
		activeScopes: () => props.activeScopes?.() ?? ['editor', 'global'],
		onIncrementalEdit: (edit) => props.document.applyIncrementalEdit?.(edit),
	})

	const mouseSelection = createMouseSelection({
		scrollElement,
		charWidth: layout.charWidth,
		tabSize: tabSize,
		lineHeight: layout.lineHeight,
	})

	const toggleFold = (startLine: number) => {
		const foldRanges = props.folds?.()
		if (
			!foldRanges?.some(
				(range) =>
					range.startLine === startLine && range.endLine > range.startLine
			)
		) {
			return
		}

		setFoldedStarts((prev) => {
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
		column: number
	) => {
		mouseSelection.handleMouseDown(event, lineIndex, column)
		if (isEditable()) input.focusInput()
	}

	createEffect(
		on(
			() => props.document.filePath(),
			() => {
				const element = scrollElement()
					if (element) {
						element.scrollTop = 0
						element.scrollLeft = 0
					}
					setFoldedStarts(new Set<number>())
				}
			)
		)
	createEffect(
		on(
			() => props.folds?.(),
			(folds) => {
				if (!folds?.length) {
					setFoldedStarts(new Set<number>())
					return
				}
				setFoldedStarts((prev) => {
					if (prev.size === 0) return prev

					const validStarts = new Set(
						folds.filter((f) => f.endLine > f.startLine).map((f) => f.startLine)
					)

					let changed = false
					const next = new Set<number>()
					for (const start of prev) {
						if (validStarts.has(start)) {
							next.add(start)
						} else {
							changed = true
						}
					}

					return changed ? next : prev
				})
			}
		)
	)

	createEffect(() => {
		const element = scrollElement()
		if (!element) return

		const unregister = props.registerEditorArea?.(() => element)
		if (typeof unregister === 'function') {
			onCleanup(unregister)
		}
	})

	const sortedHighlights = createMemo(() => {
		const highlights = props.highlights?.()
		if (!highlights?.length) return []
		return highlights.slice().sort((a, b) => a.startIndex - b.startIndex)
	})

	const sortedErrorHighlights = createMemo(() => {
		const errors = props.errors?.()
		if (!errors?.length) return []

		return errors
			.map((error) => ({
				startIndex: error.startIndex,
				endIndex: error.endIndex,
				scope: error.isMissing ? 'missing' : 'error',
			}))
			.sort((a, b) => a.startIndex - b.startIndex)
	})

	const getLineHighlights = (entry: LineEntry): LineHighlightSegment[] => {
		const lineStart = entry.start
		const lineLength = entry.length
		const lineTextLength = entry.text.length
		const highlights = sortedHighlights()

		let highlightSegments: LineHighlightSegment[]

		if (highlights.length > 0) {
			// Use tree-sitter highlights
			highlightSegments = toLineHighlightSegmentsForLine(
				lineStart,
				lineLength,
				lineTextLength,
				highlights
			)
		} else {
			// Fallback to quick lexer
			const { tokens } = quickTokenizeLine(entry.text)
			highlightSegments = quickTokensToSegments(
				tokens,
				getHighlightClassForScope
			)
		}

		const errorSegments = toLineHighlightSegmentsForLine(
			lineStart,
			lineLength,
			lineTextLength,
			sortedErrorHighlights()
		)

		return mergeLineSegments(highlightSegments, errorSegments)
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
				ref={setScrollElement}
				class="relative  flex-1 overflow-auto   bg-zinc-950/30"
				style={{
					'font-size': `${props.fontSize()}px`,
					'font-family': props.fontFamily(),
					'user-select': 'none',
				}}
				onClick={() => input.focusInput()}
			>
				<Input
					inputRef={(element) => {
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
						position: 'relative',
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
							displayToLine={layout.displayToLine}
						/>

						<Lines
							rows={layout.virtualItems}
							contentWidth={layout.contentWidth}
							lineHeight={layout.lineHeight}
							charWidth={layout.charWidth}
							tabSize={tabSize}
							isEditable={isEditable}
							onPreciseClick={input.handlePreciseClick}
							onMouseDown={handleLineMouseDown}
							activeLineIndex={layout.activeLineIndex}
							bracketDepths={props.bracketDepths}
							getLineHighlights={getLineHighlights}
							displayToLine={layout.displayToLine}
						/>
					</div>
				</div>
			</div>
		</Show>
	)
}
