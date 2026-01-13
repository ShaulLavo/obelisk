import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	untrack,
} from 'solid-js'

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
import { Minimap, HorizontalScrollbar } from '../minimap'
import type {
	DocumentIncrementalEdit,
	EditorProps,
	FoldRange,
	HighlightOffsets,
	LineEntry,
} from '../types'
import { mapRangeToOldOffsets } from '../utils/highlights'
import { shiftFoldRanges } from '../utils/foldShift'

const getLineOffsetShift = (
	lineStart: number,
	lineEnd: number,
	offsets: HighlightOffsets
) => {
	let shift = 0
	let intersects = false

	for (const offset of offsets) {
		if (!offset) continue
		if (offset.newEndIndex <= lineStart) {
			shift += offset.charDelta
			continue
		}
		if (offset.fromCharIndex >= lineEnd) {
			continue
		}
		intersects = true
	}

	if (intersects || shift === 0) {
		return {
			shift: 0,
			intersects,
			oldStart: lineStart,
			oldEnd: lineEnd,
		}
	}

	const mapped = mapRangeToOldOffsets(lineStart, lineEnd, offsets)
	return {
		shift,
		intersects: false,
		oldStart: mapped.start,
		oldEnd: mapped.end,
	}
}

export const TextEditorView = (props: EditorProps) => {
	const cursor = useCursor()

	const tabSize = () => props.tabSize?.() ?? DEFAULT_TAB_SIZE
	const [scrollElement, setScrollElement] = createSignal<HTMLDivElement | null>(
		null
	)

	const showMinimap = () => true
	const showHighlights = () => true

	useScrollBenchmark({ scrollElement })

	let inputElement: HTMLTextAreaElement | null = null
	const setInputElement = (element: HTMLTextAreaElement) => {
		inputElement = element
	}

	const MAX_LINES_TO_PRECOMPUTE_BEFORE_EDIT = 4000
	const [precomputeSettled, setPrecomputeSettled] = createSignal(false)
	let precomputeReleased = false

	/*
	 * Line highlights are precomputed using line accessors instead of
	 * allocating an array of LineEntry objects. This avoids O(N) allocation
	 * on every highlight update or offsets change.
	 */
	const {
		getLineHighlights,
		getHighlightsRevision,
		isPrecomputedReady,
		enablePrecomputedSegments,
		releasePrecomputedSegments,
	} = createLineHighlights({
		highlights: () => (showHighlights() ? props.highlights?.() : undefined),
		errors: () => props.errors?.(),
		highlightOffset: () =>
			showHighlights() ? props.highlightOffset?.() : undefined,
		lineCount: cursor.lines.lineCount,
		getLineStart: cursor.lines.getLineStart,
		getLineLength: cursor.lines.getLineLength,
		getLineTextLength: cursor.lines.getLineTextLength,
	})

	createEffect(() => {
		props.document.filePath()
		precomputeReleased = false
		enablePrecomputedSegments()
	})

	const shouldGateEditsForPrecompute = createMemo(() => {
		if (!props.isFileSelected()) return false
		if (!showHighlights()) return false
		if (props.document.isEditable() !== true) return false

		const hasOffsets = (props.highlightOffset?.()?.length ?? 0) > 0
		if (hasOffsets) return false

		const lineCount = cursor.lines.lineCount()
		if (lineCount <= MAX_LINES_TO_PRECOMPUTE_BEFORE_EDIT) return false

		const highlightCount = props.highlights?.()?.length ?? 0
		const errorCount = props.errors?.()?.length ?? 0
		if (highlightCount === 0 && errorCount === 0) return false

		return true
	})

	const shouldBlockEditingForPrecompute = createMemo(
		() => shouldGateEditsForPrecompute() && !precomputeSettled()
	)

	let settleScheduled = false
	let lastSettledPath: string | undefined
	createEffect(() => {
		const currentPath = props.document.filePath()

		if (!shouldGateEditsForPrecompute()) {
			settleScheduled = false
			precomputeReleased = false
			if (!precomputeSettled()) setPrecomputeSettled(true)
			return
		}

		if (!isPrecomputedReady()) {
			settleScheduled = false
			precomputeReleased = false
			if (precomputeSettled()) setPrecomputeSettled(false)
			return
		}

		// Warm cache: if precomputed data is already ready when we first check this file,
		// settle immediately without waiting for RAF+idle (no heavy computation happened)
		if (lastSettledPath !== currentPath && isPrecomputedReady()) {
			lastSettledPath = currentPath
			if (!precomputeReleased) {
				precomputeReleased = true
				releasePrecomputedSegments()
			}
			setPrecomputeSettled(true)
			return
		}

		if (precomputeSettled() || settleScheduled) {
			return
		}
		settleScheduled = true

		// Give the browser a chance to do follow-up work (including GC) before edits.
		// `requestIdleCallback` is the most reliable signal that "expensive stuff" has settled.
		let timeoutId: ReturnType<typeof setTimeout> | undefined
		let idleId: number | undefined
		const rafId =
			typeof requestAnimationFrame === 'function'
				? requestAnimationFrame(() => {
						if (!precomputeReleased) {
							precomputeReleased = true
							releasePrecomputedSegments()
						}

						const commit = () => {
							lastSettledPath = currentPath
							setPrecomputeSettled(true)
						}

						// Prefer waiting for idle. If not available, add a small delay to
						// reduce the chance we un-block right before a GC pause.
						if (typeof requestIdleCallback === 'function') {
							idleId = requestIdleCallback(
								() => {
									commit()
								},
								{ timeout: 200 }
							)
						} else {
							timeoutId = setTimeout(commit, 50)
						}
					})
				: undefined

		onCleanup(() => {
			if (
				typeof rafId === 'number' &&
				typeof cancelAnimationFrame === 'function'
			) {
				cancelAnimationFrame(rafId)
			}
			if (
				typeof idleId === 'number' &&
				typeof cancelIdleCallback === 'function'
			) {
				cancelIdleCallback(idleId)
			}
			if (timeoutId) clearTimeout(timeoutId)
			settleScheduled = false
		})
	})

	const isEditable = () =>
		props.document.isEditable() && !shouldBlockEditingForPrecompute()

	const handleIncrementalEditStart = () => {
		if (!props.isFileSelected()) {
			return
		}
		releasePrecomputedSegments()
	}

	const handleIncrementalEdit = (edit: DocumentIncrementalEdit) => {
		if (!props.isFileSelected()) {
			return
		}
		props.document.applyIncrementalEdit?.(edit)
	}

	// Apply offset shifts to fold ranges for optimistic updates
	// Memoization: cache result and only recompute when line-changing offsets change
	let cachedFoldsInput: FoldRange[] | undefined
	let cachedLineChangingCount = 0
	let cachedResult: FoldRange[] | undefined

	const shiftedFolds = createMemo(() => {
		const folds = props.folds?.()
		const offsets = props.highlightOffset?.()

		// Fast path: no offsets means no shift needed
		if (!offsets?.length) {
			return folds
		}

		// Count line-changing offsets only
		let lineChangingCount = 0
		for (const offset of offsets) {
			if (offset.lineDelta !== 0 || offset.oldEndRow !== offset.newEndRow) {
				lineChangingCount++
			}
		}

		// If folds haven't changed and line-changing offset count is same, return cached result
		if (
			folds === cachedFoldsInput &&
			lineChangingCount === cachedLineChangingCount &&
			cachedResult !== undefined
		) {
			return cachedResult
		}

		// Compute new result
		const result = shiftFoldRanges(folds, offsets)

		// Update cache
		cachedFoldsInput = folds
		cachedLineChangingCount = lineChangingCount
		cachedResult = result

		return result
	})

	const { foldedStarts, toggleFold } = useFoldedStarts({
		filePath: () => props.document.filePath(),
		folds: shiftedFolds,
		scrollElement,
	})

	const layout = createTextEditorLayout({
		fontSize: () => props.fontSize(),
		fontFamily: () => props.fontFamily(),
		isFileSelected: () => props.isFileSelected(),
		filePath: () => props.document.filePath(),
		tabSize,
		scrollElement,
		folds: shiftedFolds,
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
		onIncrementalEditStart: handleIncrementalEditStart,
		onIncrementalEdit: handleIncrementalEdit,
		onSave: untrack(() => props.onSave),
		onEditBlocked: untrack(() => props.onEditBlocked),
	})

	const mouseSelection = createMouseSelection({
		scrollElement,
		charWidth: layout.charWidth,
		tabSize,
		lineHeight: layout.lineHeight,
		gutterWidth: layout.gutterWidth,
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

	let restoreAttemptedForPath: string | undefined
	let saveTimeoutId: ReturnType<typeof setTimeout> | undefined
	// Track when we last restored scroll to ignore spurious scroll events
	let lastScrollRestoreTime = 0
	const SCROLL_RESTORE_DEBOUNCE_MS = 500

	createEffect(() => {
		const element = scrollElement()
		const path = props.document.filePath()
		const initialPos = props.initialScrollPosition?.()
		// Read totalSize and virtualItems to re-trigger when virtualizer content is ready
		const contentSize = layout.totalSize()
		const items = layout.virtualItems()
		const currentLineHeight = layout.lineHeight()

		// Virtualizer must have computed items and reasonable content size
		const hasVirtualizedContent = items.length > 0 && contentSize > 100

		// Support both new format (scrollTop) and legacy format (lineIndex as pixels)
		const savedScrollTop = initialPos?.scrollTop ?? initialPos?.lineIndex ?? 0

		if (
			element &&
			hasVirtualizedContent &&
			initialPos &&
			restoreAttemptedForPath !== path &&
			savedScrollTop > 0
		) {
			// Validate: check if line height changed (indicates font/size change)
			if (initialPos.lineHeight && initialPos.lineHeight !== currentLineHeight) {
				// TODO: Font or font size changed between sessions
				// Consider: 1) Recalculate scroll from lineIndex with new lineHeight
				//           2) Store font info to detect font family changes
				//           3) Warn user about potential scroll position drift
				console.warn(
					`[ScrollRestore] Line height changed! ` +
					`saved: ${initialPos.lineHeight}px, current: ${currentLineHeight}px. ` +
					`Using saved pixel position (may be slightly off).`
				)
			}

			restoreAttemptedForPath = path
			lastScrollRestoreTime = Date.now()
			element.scrollTo({ top: savedScrollTop, left: initialPos.scrollLeft ?? 0 })
		}
	})

	createEffect(() => {
		const element = scrollElement()
		// Access callback lazily inside handler to maintain reactivity
		const getOnScroll = () => props.onScrollPositionChange
		const getLineHeight = () => layout.lineHeight()
		if (!element) return

		const handleScroll = () => {
			if (saveTimeoutId != null) clearTimeout(saveTimeoutId)
			saveTimeoutId = setTimeout(() => {
				const onScroll = getOnScroll()
				if (!onScroll) return

				const currentLineHeight = getLineHeight()
				const scrollTop = element.scrollTop
				const lineIndex = currentLineHeight > 0 ? Math.floor(scrollTop / currentLineHeight) : 0

				const pos = {
					scrollTop,
					lineIndex,
					lineHeight: currentLineHeight,
					scrollLeft: element.scrollLeft,
				}
				onScroll(pos)
			}, 150)
		}

		element.addEventListener('scroll', handleScroll, { passive: true })
		onCleanup(() => {
			element.removeEventListener('scroll', handleScroll)
			if (saveTimeoutId != null) clearTimeout(saveTimeoutId)
		})
	})

	// Restore cursor position from persisted tab state (activates cursor)
	let cursorRestoreAttemptedForPath: string | undefined
	createEffect(() => {
		const path = props.document.filePath()
		const initialCursor = props.initialCursorPosition?.()
		const lineCount = cursor.lines.lineCount()

		// Only restore if we have a cached position and haven't restored for this path yet
		if (
			initialCursor &&
			cursorRestoreAttemptedForPath !== path &&
			lineCount > 0 &&
			!cursor.state.hasCursor
		) {
			cursorRestoreAttemptedForPath = path
			// setCursorFromClick activates cursor (sets hasCursor: true)
			cursor.actions.setCursorFromClick(initialCursor.line, initialCursor.column)
		}
	})

	// Save cursor position changes to tab state
	let cursorSaveTimeoutId: ReturnType<typeof setTimeout> | undefined
	createEffect(() => {
		const onCursorChange = props.onCursorPositionChange
		if (!onCursorChange) return

		const line = cursor.state.position.line
		const column = cursor.state.position.column

		// Debounce saves
		if (cursorSaveTimeoutId != null) clearTimeout(cursorSaveTimeoutId)
		cursorSaveTimeoutId = setTimeout(() => {
			onCursorChange({ line, column })
		}, 150)

		onCleanup(() => {
			if (cursorSaveTimeoutId != null) clearTimeout(cursorSaveTimeoutId)
		})
	})

	// Restore selections from persisted tab state
	let selectionRestoreAttemptedForPath: string | undefined
	createEffect(() => {
		const path = props.document.filePath()
		const initialSelections = props.initialSelections?.()
		const documentLength = cursor.documentLength()

		// Only restore if we have cached selections and haven't restored for this path yet
		if (
			initialSelections &&
			initialSelections.length > 0 &&
			selectionRestoreAttemptedForPath !== path &&
			documentLength > 0
		) {
			selectionRestoreAttemptedForPath = path
			// Restore selections by setting each one
			for (const selection of initialSelections) {
				// Clamp to document bounds
				const anchor = Math.min(selection.anchor, documentLength)
				const focus = Math.min(selection.focus, documentLength)
				cursor.actions.setSelection(anchor, focus)
			}
		}
	})

	// Save selection changes to tab state
	let selectionSaveTimeoutId: ReturnType<typeof setTimeout> | undefined
	createEffect(() => {
		const onSelectionsChange = props.onSelectionsChange
		if (!onSelectionsChange) return

		const selections = cursor.state.selections

		// Debounce saves
		if (selectionSaveTimeoutId != null) clearTimeout(selectionSaveTimeoutId)
		selectionSaveTimeoutId = setTimeout(() => {
			onSelectionsChange(selections)
		}, 150)

		onCleanup(() => {
			if (selectionSaveTimeoutId != null) clearTimeout(selectionSaveTimeoutId)
		})
	})

	const getLineBracketDepths = (entry: LineEntry) => {
		const brackets = props.brackets?.()
		if (!brackets || brackets.length === 0) {
			return undefined
		}

		const lineStart =
			entry.lineId > 0
				? cursor.lines.getLineStartById(entry.lineId)
				: entry.start
		const lineLength =
			entry.lineId > 0
				? cursor.lines.getLineLengthById(entry.lineId)
				: entry.length
		const lineEnd = lineStart + lineLength
		// Use untrack to prevent all line memos from invalidating when highlightOffset changes
		const offsets = untrack(() => props.highlightOffset?.())
		const offsetInfo =
			offsets && offsets.length > 0
				? getLineOffsetShift(lineStart, lineEnd, offsets)
				: null
		const bracketStart = offsetInfo?.intersects
			? lineStart
			: (offsetInfo?.oldStart ?? lineStart)
		const bracketEnd = offsetInfo?.intersects
			? lineEnd
			: (offsetInfo?.oldEnd ?? lineEnd)
		const shift = offsetInfo?.intersects ? 0 : (offsetInfo?.shift ?? 0)

		const map: Record<number, number> = {}
		let found = false

		let low = 0
		let high = brackets.length
		while (low < high) {
			const mid = (low + high) >>> 1
			if (brackets[mid]!.index < bracketStart) {
				low = mid + 1
			} else {
				high = mid
			}
		}

		for (let i = low; i < brackets.length; i++) {
			const b = brackets[i]!
			if (b.index >= bracketEnd) break
			const mappedIndex = shift === 0 ? b.index : b.index + shift
			const relativeIndex = mappedIndex - lineStart
			if (relativeIndex < 0 || relativeIndex >= lineLength) continue
			map[relativeIndex] = b.depth
			found = true
		}
		return found ? map : undefined
	}

	const buildLineEntry = (lineIndex: number): LineEntry => {
		const lineId = cursor.lines.getLineId(lineIndex)
		const start =
			lineId > 0
				? cursor.lines.getLineStartById(lineId)
				: cursor.lines.getLineStart(lineIndex)
		const length =
			lineId > 0
				? cursor.lines.getLineLengthById(lineId)
				: cursor.lines.getLineLength(lineIndex)
		const text =
			lineId > 0
				? cursor.lines.getLineTextById(lineId)
				: cursor.lines.getLineText(lineIndex)

		return {
			lineId,
			index: lineIndex,
			start,
			length,
			text,
		}
	}

	const getLineEntry = (lineIndex: number) => {
		const count = cursor.lines.lineCount()
		if (lineIndex < 0 || lineIndex >= count) {
			return null
		}
		return buildLineEntry(lineIndex)
	}

	const { markLiveContentAvailable, getCachedRuns } = useVisibleContentCache({
		filePath: () => props.document.filePath(),
		scrollElement,
		virtualItems: layout.virtualItems,
		resolveLineIndex: (item) => {
			const lineId = item.lineId
			if (lineId > 0) {
				const resolved = cursor.lines.getLineIndex(lineId)
				if (resolved >= 0) return resolved
			}
			return layout.displayToLine(item.index)
		},
		getLineEntry,
		getLineBracketDepths,
		getLineHighlights,
		initialVisibleContent: props.initialVisibleContent,
		onCaptureVisibleContent: (snapshot) =>
			props.onCaptureVisibleContent?.(snapshot),
	})

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
					highlightRevision={getHighlightsRevision}
					getCachedRuns={getCachedRuns}
					folds={shiftedFolds}
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
				<HorizontalScrollbar
					scrollElement={scrollElement}
					class="absolute bottom-0 left-0 right-[14px] z-50"
				/>
			</div>
		</Show>
	)
}
