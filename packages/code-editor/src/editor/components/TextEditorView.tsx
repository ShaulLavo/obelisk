import { Show, createEffect, createSignal, onCleanup, untrack } from 'solid-js'

import { DEFAULT_TAB_SIZE } from '../consts'
import { useCursor } from '../cursor'
import {
	createCursorScrollSync,
	createMouseSelection,
	createTextEditorInput,
	createTextEditorLayout,
	createLineHighlights,
	useFoldedStarts,
	useScrollBenchmark,
	useVisibleContentCache,
} from '../hooks'
import { EditorViewport } from './EditorViewport'
import { Minimap } from '../minimap'
import type { DocumentIncrementalEdit, EditorProps, LineEntry } from '../types'

export const TextEditorView = (props: EditorProps) => {
	const cursor = useCursor()

	const tabSize = () => props.tabSize?.() ?? DEFAULT_TAB_SIZE
	const [scrollElement, setScrollElement] = createSignal<HTMLDivElement | null>(
		null
	)
	// Perf isolation: disable minimap during scroll benchmarking.
	const showMinimap = () => true
	const showHighlights = () => true

	useScrollBenchmark({ scrollElement })

	let inputElement: HTMLTextAreaElement | null = null
	const setInputElement = (element: HTMLTextAreaElement) => {
		inputElement = element
	}

	const isEditable = () => props.document.isEditable()

	const handleIncrementalEdit = (edit: DocumentIncrementalEdit) => {
		if (!props.isFileSelected()) {
			return
		}
		props.document.applyIncrementalEdit?.(edit)
	}

	const { foldedStarts, toggleFold } = useFoldedStarts({
		filePath: () => props.document.filePath(),
		folds: () => props.folds?.(),
		scrollElement,
	})

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
		onIncrementalEdit: handleIncrementalEdit,
		onSave: untrack(() => props.onSave),
	})

	const mouseSelection = createMouseSelection({
		scrollElement,
		charWidth: layout.charWidth,
		tabSize,
		lineHeight: layout.lineHeight,
	})

	const handleLineMouseDown = (
		event: MouseEvent,
		lineIndex: number,
		column: number
	) => {
		mouseSelection.handleMouseDown(event, lineIndex, column)
		if (isEditable()) input.focusInput()
	}

	createEffect(() => {
		const element = scrollElement()
		if (!element) return

		const unregister = props.registerEditorArea?.(() => element)
		if (typeof unregister === 'function') {
			onCleanup(unregister)
		}
	})

	// Scroll position caching: restore on file switch, save on scroll
	let restoreAttemptedForPath: string | undefined
	let saveTimeoutId: ReturnType<typeof setTimeout> | undefined

	createEffect(() => {
		const element = scrollElement()
		const path = props.document.filePath()
		const initialPos = props.initialScrollPosition?.()

		// Only restore once per file switch
		if (!element || !path || restoreAttemptedForPath === path) return
		restoreAttemptedForPath = path

		if (initialPos) {
			// Restore scroll position in next microtask to ensure DOM is ready
			queueMicrotask(() => {
				element.scrollTop = initialPos.scrollTop
				element.scrollLeft = initialPos.scrollLeft
			})
		}
	})

	createEffect(() => {
		const element = scrollElement()
		const onScroll = props.onScrollPositionChange
		if (!element || !onScroll) return

		const handleScroll = () => {
			// Debounce: save after scrolling settles
			if (saveTimeoutId != null) clearTimeout(saveTimeoutId)
			saveTimeoutId = setTimeout(() => {
				onScroll({
					scrollTop: element.scrollTop,
					scrollLeft: element.scrollLeft,
				})
			}, 150)
		}

		element.addEventListener('scroll', handleScroll, { passive: true })
		onCleanup(() => {
			element.removeEventListener('scroll', handleScroll)
			if (saveTimeoutId != null) clearTimeout(saveTimeoutId)
		})
	})

	const getLineBracketDepths = (entry: LineEntry) => {
		const brackets = props.brackets?.()
		if (!brackets || brackets.length === 0) return undefined

		const map: Record<number, number> = {}
		let found = false

		// Binary search for the first bracket in the line
		let low = 0
		let high = brackets.length
		while (low < high) {
			const mid = (low + high) >>> 1
			if (brackets[mid]!.index < entry.start) {
				low = mid + 1
			} else {
				high = mid
			}
		}

		// Collect all brackets within the line
		for (let i = low; i < brackets.length; i++) {
			const b = brackets[i]!
			if (b.index >= entry.start + entry.length) break
			map[b.index - entry.start] = b.depth
			found = true
		}

		return found ? map : undefined
	}

	const { getLineHighlights } = createLineHighlights({
		highlights: () => (showHighlights() ? props.highlights?.() : undefined),
		errors: () => props.errors?.(),
		highlightOffset: () =>
			showHighlights() ? props.highlightOffset?.() : undefined,
	})
	// const getLineHighlights = () => undefined
	// Helper to get line entry for caching
	const getLineEntry = (lineIndex: number) => {
		if (lineIndex < 0 || lineIndex >= cursor.lines.lineCount()) {
			return null
		}
		return {
			index: lineIndex,
			start: cursor.lines.getLineStart(lineIndex),
			length: cursor.lines.getLineLength(lineIndex),
			text: cursor.lines.getLineText(lineIndex),
		}
	}

	// Visible content caching for instant tab switching
	const { markLiveContentAvailable, getCachedRuns } = useVisibleContentCache({
		filePath: () => props.document.filePath(),
		scrollElement,
		virtualItems: layout.virtualItems,
		getLineEntry,
		getLineBracketDepths,
		getLineHighlights,
		initialVisibleContent: props.initialVisibleContent,
		onCaptureVisibleContent: (snapshot) =>
			props.onCaptureVisibleContent?.(snapshot),
	})

	// Mark live content as available when we have highlights (or when file is ready)
	createEffect(() => {
		const highlightCount = showHighlights()
			? (props.highlights?.()?.length ?? 0)
			: 0
		const hasContent = cursor.lines.lineCount() > 0
		if (hasContent && (highlightCount > 0 || props.isFileSelected())) {
			markLiveContentAvailable()
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
				id="editor"
				class="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
			>
				<EditorViewport
					setScrollElement={setScrollElement}
					setInputElement={setInputElement}
					layout={layout}
					input={input}
					isEditable={isEditable}
					fontSize={props.fontSize}
					fontFamily={props.fontFamily}
					cursorMode={props.cursorMode}
					tabSize={tabSize}
					getLineBracketDepths={getLineBracketDepths}
					getLineHighlights={getLineHighlights}
					getCachedRuns={getCachedRuns}
					folds={props.folds}
					foldedStarts={foldedStarts}
					onToggleFold={toggleFold}
					onLineMouseDown={handleLineMouseDown}
				/>
				<Show when={showMinimap()}>
					<Minimap
						scrollElement={scrollElement}
						errors={props.errors}
						treeSitterWorker={props.treeSitterWorker}
						filePath={props.document.filePath()}
						version={props.documentVersion}
						content={props.document.content}
					/>
				</Show>
			</div>
		</Show>
	)
}
