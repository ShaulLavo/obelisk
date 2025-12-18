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
import { Lexer } from '@repo/lexer'
import {
	createCursorScrollSync,
	createTextEditorInput,
	createTextEditorLayout,
	createMouseSelection,
} from '../hooks'
import type {
	BracketDepthMap,
	EditorSyntaxHighlight,
	LineEntry,
	LineHighlightSegment,
	TextFileEditorProps,
} from '../types'

type TextFileEditorInnerProps = TextFileEditorProps & {
	treeSitterBracketDepths: Accessor<BracketDepthMap | undefined>
}

export const TextFileEditorInner = (props: TextFileEditorInnerProps) => {
	const cursor = useCursor()

	// Create lexer instance for syntax highlighting
	const lexer = Lexer.create()

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

	// Compute lexer states on-the-fly if no cache exists
	// This is a fallback for files opened before the cache was populated
	const computedLexerStates = createMemo(() => {
		const cached = props.lexerLineStates?.()
		if (cached?.length) {
			lexer.setLineStates(cached)
			return cached
		}

		// Compute from document content
		const content = props.document.content()
		if (!content) return undefined

		return lexer.computeAllStates(content)
	})

	// Compute bracket depths for visible lines using cached lexer states
	const visibleBracketDepths = createMemo<BracketDepthMap | undefined>(() => {
		// If tree-sitter brackets are available, use those
		const treeSitterDepths = props.treeSitterBracketDepths()
		if (treeSitterDepths) return treeSitterDepths

		// Fall back to computing brackets from lexer states for visible lines
		const lexerStates = computedLexerStates()
		if (!lexerStates?.length) return undefined

		const depthMap: BracketDepthMap = {}
		const items = layout.virtualItems()

		for (const item of items) {
			const lineIndex = layout.displayToLine(item.index())
			if (lineIndex < 0 || lineIndex >= lexerStates.length) continue

			const lineText = cursor.lines.getLineText(lineIndex)
			const startState = lexer.getLineState(lineIndex) ?? Lexer.initialState()
			const { brackets } = lexer.tokenizeLine(lineText, startState)

			for (const bracket of brackets) {
				depthMap[bracket.index] = bracket.depth
			}
		}

		return Object.keys(depthMap).length > 0 ? depthMap : undefined
	})

	// Cache for computed line highlights - cleared when source highlights change
	let highlightCache = new Map<number, LineHighlightSegment[]>()
	let lastHighlightsRef: EditorSyntaxHighlight[] | undefined
	let lastErrorsRef:
		| { startIndex: number; endIndex: number; scope: string }[]
		| undefined
	const MAX_HIGHLIGHT_CACHE_SIZE = 500

	const getLineHighlights = (entry: LineEntry): LineHighlightSegment[] => {
		const lineStart = entry.start
		const lineLength = entry.length
		const lineTextLength = entry.text.length
		const highlights = sortedHighlights()
		const errors = sortedErrorHighlights()

		// Clear cache if source data changed
		if (highlights !== lastHighlightsRef || errors !== lastErrorsRef) {
			highlightCache = new Map()
			lastHighlightsRef = highlights
			lastErrorsRef = errors
		}

		// Check cache first
		const cached = highlightCache.get(entry.index)
		if (cached !== undefined) {
			return cached
		}

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
			// Fallback to lexer with cached state
			const lineState = lexer.getLineState(entry.index)
			const { tokens } = lexer.tokenizeLine(
				entry.text,
				lineState ?? Lexer.initialState()
			)
			highlightSegments = lexer.tokensToSegments(
				tokens,
				getHighlightClassForScope
			)
		}

		const errorSegments = toLineHighlightSegmentsForLine(
			lineStart,
			lineLength,
			lineTextLength,
			errors
		)

		const result = mergeLineSegments(highlightSegments, errorSegments)

		// Cache the result with LRU eviction
		highlightCache.set(entry.index, result)
		if (highlightCache.size > MAX_HIGHLIGHT_CACHE_SIZE) {
			// Evict oldest entry
			const firstKey = highlightCache.keys().next().value
			if (typeof firstKey === 'number') {
				highlightCache.delete(firstKey)
			}
		}

		return result
	}

	// @ts-ignore
	window.startBenchmark = async () => {
		const element = scrollElement()
		if (!element) return

		console.log('Starting physics benchmark...')
		const start = performance.now()
		const startScroll = 0
		element.scrollTop = 0

		const maxScroll = element.scrollHeight - element.clientHeight
		const cycles = 5
		let frames = 0

		// Physics State
		let position = 0
		let velocity = 0
		let direction = 1 // 1 for down, -1 for up
		let currentCycle = 0

		// Physics Constants
		const ACCEL = 4 // px/frame^2
		const BRAKE = 10 // px/frame^2 (Deceleration)

		return new Promise<void>((resolve) => {
			const animate = () => {
				const target = direction === 1 ? maxScroll : 0
				const dist = Math.abs(target - position)

				// Calculate stopping distance required at current velocity: v^2 = 2*a*d => d = v^2 / 2a
				const stoppingDist = (velocity * velocity) / (2 * BRAKE)

				if (dist <= stoppingDist) {
					// BRAKE!
					if (velocity > 0) velocity = Math.max(0, velocity - BRAKE)
				} else {
					// ACCELERATE!
					velocity += ACCEL
				}

				// Apply movement
				const move = velocity * direction
				position += move

				// Bounds check and Turnaround
				let turnAround = false

				if (direction === 1 && position >= maxScroll) {
					position = maxScroll
					turnAround = true
				} else if (direction === -1 && position <= 0) {
					position = 0
					turnAround = true
				}

				element.scrollTop = position

				if (turnAround) {
					velocity = 0 // Stopped
					if (direction === 1) {
						direction = -1
					} else {
						direction = 1
						currentCycle++
					}
				}

				if (currentCycle < cycles) {
					frames++
					requestAnimationFrame(animate)
				} else {
					const end = performance.now()
					const duration = end - start
					const fps = Math.round((frames / duration) * 1000)
					console.log(
						`Benchmark complete: ${fps} FPS, ${duration.toFixed(2)}ms duration, ${frames} frames`
					)
					element.scrollTop = startScroll
					resolve()
				}
			}
			requestAnimationFrame(animate)
		})
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
							bracketDepths={visibleBracketDepths}
							getLineHighlights={getLineHighlights}
							displayToLine={layout.displayToLine}
						/>
					</div>
				</div>
			</div>
		</Show>
	)
}
