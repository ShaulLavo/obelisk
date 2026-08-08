/**
 * makeEditorView — top-level imperative view coordinator.
 *
 * Assembles the DOM structure:
 *   editor-root
 *     scroll-container
 *       content-spacer (sets scroll height)
 *       gutter-layer
 *       text-layer
 *       overlay-layer
 *     hidden-input-surface
 *
 * Wires ResizeObserver, scroll handling, and exposes measurement API.
 * Does not interpret document semantics — just renders what core says.
 */

import type { EditorCore, EditorDirtyState, FlushReceipt } from '../core/types'
import {
	type EditorMetrics,
	type CaretRect,
	measureFont,
	xToColumn,
	lineFromClientY,
	getCaretRect,
	computePoolSize,
} from './domMetrics'
import {
	makeVisibleRangeRenderer,
	type VisibleRangeRenderer,
	type VisibleRangeRendererConfig,
} from './makeVisibleRangeRenderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorViewConfig = {
	core: EditorCore
	tabSize: number
	/**
	 * Per-line decoration lookup, keyed by line ID. Supplied by the session from
	 * its DecorationStore. Omit to render every line as plain text.
	 */
	getLineDecorations?: VisibleRangeRendererConfig['getLineDecorations']
}

export type EditorView = {
	/** Attach to a host element — builds DOM and starts observing. */
	attach(host: HTMLElement): void
	/** Detach from the host — tears down DOM and observers. */
	detach(): void
	/** Flush dirty state to the DOM. Called by FrameScheduler. */
	flush(dirty: EditorDirtyState): FlushReceipt
	/** Get the hidden textarea for InputController to attach to. */
	getTextarea(): HTMLTextAreaElement | null
	/** Move the scroll container, e.g. when restoring persisted view state. */
	setScrollPosition(scrollTop: number, scrollLeft: number): void
	/** Measurement API — get caret rect for a line/column. */
	getCaretRect(lineIndex: number, column: number): CaretRect
	/** Measurement API — convert X to column in a line. */
	xToColumn(lineIndex: number, x: number): number
	/** Measurement API — find line from client Y. */
	lineFromClientY(clientY: number): number
	/** Measurement API — get current metrics. */
	getMetrics(): EditorMetrics
	/** Measurement API — get gutter width. */
	getGutterWidth(): number
	/** Notify the view of a theme/font change (triggers remeasurement). */
	remeasureFont(): void
	/** Tear down everything. */
	destroy(): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeEditorView = (config: EditorViewConfig): EditorView => {
	const { core, tabSize, getLineDecorations } = config

	let host: HTMLElement | null = null
	let scrollContainer: HTMLElement | null = null
	let contentSpacer: HTMLElement | null = null
	let textarea: HTMLTextAreaElement | null = null
	let renderer: VisibleRangeRenderer | null = null
	let resizeObserver: ResizeObserver | null = null
	let destroyed = false

	let metrics: EditorMetrics = {
		charWidth: 8,
		lineHeight: 18,
		tabSize,
		overscanLines: 10,
	}

	let themeVersion = 0
	let decorationRevision = 0

	/**
	 * A scroll offset requested before the content had height. Assigning
	 * scrollTop to a container with no scrollable content is silently clamped to
	 * 0, which would leave the core scrolled and the DOM at the top — the view
	 * then paints rows the user cannot see. Re-applied after the next flush.
	 */
	let pendingScrollTop: number | null = null
	let pendingScrollLeft: number | null = null

	const applyPendingScroll = () => {
		if (!scrollContainer) return
		if (pendingScrollTop === null && pendingScrollLeft === null) return

		if (pendingScrollTop !== null) scrollContainer.scrollTop = pendingScrollTop
		if (pendingScrollLeft !== null) scrollContainer.scrollLeft = pendingScrollLeft

		// Only give up once the container actually holds the requested offset, or
		// has scrolled as far as it can.
		const topSettled =
			pendingScrollTop === null ||
			Math.abs(scrollContainer.scrollTop - pendingScrollTop) < 1 ||
			scrollContainer.scrollTop >=
				scrollContainer.scrollHeight - scrollContainer.clientHeight - 1
		const leftSettled =
			pendingScrollLeft === null ||
			Math.abs(scrollContainer.scrollLeft - pendingScrollLeft) < 1 ||
			scrollContainer.scrollLeft >=
				scrollContainer.scrollWidth - scrollContainer.clientWidth - 1

		if (topSettled) pendingScrollTop = null
		if (leftSettled) pendingScrollLeft = null
	}

	// -----------------------------------------------------------------
	// Scroll handling
	// -----------------------------------------------------------------

	const onScroll = () => {
		if (!scrollContainer || destroyed) return
		core.updateViewport({
			scrollTop: scrollContainer.scrollTop,
			scrollLeft: scrollContainer.scrollLeft,
			viewportWidth: scrollContainer.clientWidth,
			viewportHeight: scrollContainer.clientHeight,
		})
	}

	// -----------------------------------------------------------------
	// Resize handling
	// -----------------------------------------------------------------

	const onResize = () => {
		if (!scrollContainer || destroyed) return
		core.updateViewport({
			scrollTop: scrollContainer.scrollTop,
			scrollLeft: scrollContainer.scrollLeft,
			viewportWidth: scrollContainer.clientWidth,
			viewportHeight: scrollContainer.clientHeight,
		})
	}

	// -----------------------------------------------------------------
	// Pointer input
	// -----------------------------------------------------------------

	/**
	 * Map a client point to a document position.
	 *
	 * X is measured against the scroll container's content box so that the
	 * gutter and the horizontal scroll offset are both accounted for.
	 */
	const positionFromClientPoint = (
		clientX: number,
		clientY: number
	): { line: number; column: number } => {
		// Measure against the scroll container, which does not move, and add the
		// scroll offset. The content spacer sits *inside* the container, so its
		// rect already has the scroll baked in — using it here as well would
		// count the scroll twice and drop the caret at the wrong line.
		const lineIndex = lineFromClientY(
			clientY,
			scrollContainer?.getBoundingClientRect().top ?? 0,
			scrollContainer?.scrollTop ?? 0,
			metrics.lineHeight,
			core.getLineCount()
		)
		const containerLeft = scrollContainer?.getBoundingClientRect().left ?? 0
		const scrollLeft = scrollContainer?.scrollLeft ?? 0
		const gutterWidth = renderer?.getGutterWidth() ?? 0
		const x = clientX - containerLeft + scrollLeft - gutterWidth
		const column = xToColumn(core.getLineText(lineIndex), Math.max(0, x), metrics)
		return { line: lineIndex, column }
	}

	let selecting = false

	const focusInput = () => {
		// preventScroll: focusing a 1px offscreen textarea would otherwise
		// yank the container back to the top.
		textarea?.focus({ preventScroll: true })
	}

	const isWordChar = (ch: string) => /[\w$]/.test(ch)

	const lineStartOffset = (line: number): number =>
		core.getSnapshot().document.lineStarts[line] ?? 0

	/** Select the word under a position. Returns false if there is no word there. */
	const selectWordAt = (line: number, column: number): boolean => {
		const lineText = core.getLineText(line)
		let start = Math.min(column, lineText.length)
		let end = start
		while (start > 0 && isWordChar(lineText[start - 1]!)) start--
		while (end < lineText.length && isWordChar(lineText[end]!)) end++
		if (start === end) return false

		const base = lineStartOffset(line)
		core.dispatch({ type: 'set-selection', anchor: base + start, focus: base + end })
		return true
	}

	/** Select a whole line, including its trailing newline where there is one. */
	const selectLine = (line: number): void => {
		const base = lineStartOffset(line)
		const end = Math.min(
			base + core.getLineText(line).length + 1,
			core.getDocumentLength()
		)
		core.dispatch({ type: 'set-selection', anchor: base, focus: end })
	}

	const onMouseDown = (event: MouseEvent) => {
		if (destroyed || event.button !== 0) return

		const { line, column } = positionFromClientPoint(event.clientX, event.clientY)

		// `detail` is the browser's click counter for this burst, so triple and
		// quadruple clicks arrive here rather than needing their own listeners —
		// `dblclick` only ever reports two.
		const clicks = event.detail

		if (clicks >= 4) {
			core.dispatch({ type: 'select-all' })
		} else if (clicks === 3) {
			selectLine(line)
		} else if (clicks === 2) {
			// Fall back to a caret when there is no word under the pointer.
			if (!selectWordAt(line, column)) {
				core.dispatch({ type: 'set-cursor-from-point', line, column })
			}
		} else {
			core.dispatch({
				type: 'set-cursor-from-point',
				line,
				column,
				extend: event.shiftKey,
			})
			// Only a plain click starts a drag; dragging after a word/line select
			// would immediately collapse it.
			selecting = true
		}

		focusInput()
		// The caret is ours to draw, so stop the browser starting a native
		// text selection over the rendered rows.
		event.preventDefault()
	}

	const onMouseMove = (event: MouseEvent) => {
		if (!selecting || destroyed) return
		const { line, column } = positionFromClientPoint(event.clientX, event.clientY)
		core.dispatch({ type: 'set-cursor-from-point', line, column, extend: true })
	}

	const onMouseUp = () => {
		selecting = false
	}

	// -----------------------------------------------------------------
	// Scroll anchoring
	// -----------------------------------------------------------------

	const applyScrollAnchor = (dirty: EditorDirtyState): void => {
		if (!scrollContainer || !dirty.scrollAnchor) return
		const anchor = dirty.scrollAnchor

		if (anchor.kind === 'delta') {
			scrollContainer.scrollTop += anchor.deltaPx
		} else {
			// Line ID anchor: find the line and scroll to it
			try {
				const lineIndex = core.getLineIndex(anchor.lineId)
				scrollContainer.scrollTop = lineIndex * metrics.lineHeight + anchor.offsetPx
			} catch {
				// Line may have been deleted — ignore
			}
		}
	}

	return {
		attach(hostEl: HTMLElement) {
			if (destroyed) return
			host = hostEl

			// Build DOM structure
			scrollContainer = document.createElement('div')
			scrollContainer.className = 'editor-scroll-container'
			scrollContainer.style.position = 'relative'
			scrollContainer.style.overflow = 'auto'
			scrollContainer.style.width = '100%'
			scrollContainer.style.height = '100%'

			contentSpacer = document.createElement('div')
			contentSpacer.className = 'editor-content-spacer'
			contentSpacer.style.position = 'relative'
			scrollContainer.appendChild(contentSpacer)

			// Hidden textarea
			textarea = document.createElement('textarea')
			textarea.className = 'editor-hidden-input'
			textarea.setAttribute('aria-label', 'Code editor input')
			textarea.setAttribute('autocomplete', 'off')
			textarea.setAttribute('autocorrect', 'off')
			textarea.setAttribute('autocapitalize', 'off')
			textarea.setAttribute('spellcheck', 'false')
			textarea.style.position = 'absolute'
			textarea.style.opacity = '0'
			textarea.style.width = '1px'
			textarea.style.height = '1px'
			textarea.style.top = '0'
			textarea.style.left = '0'
			textarea.style.overflow = 'hidden'
			textarea.style.resize = 'none'
			textarea.style.outline = 'none'
			textarea.style.border = 'none'
			textarea.style.padding = '0'
			textarea.style.margin = '0'

			host.appendChild(scrollContainer)
			host.appendChild(textarea)

			// Measure font
			const measured = measureFont(host)
			metrics = {
				charWidth: measured.charWidth,
				lineHeight: measured.lineHeight,
				tabSize,
				overscanLines: computePoolSize(host.clientHeight, measured.lineHeight).overscanRows,
			}

			// Size the content before the first flush so the container is
			// immediately scrollable and a restored offset can be applied.
			contentSpacer.style.height = `${core.getLineCount() * metrics.lineHeight}px`

			// Create renderer
			renderer = makeVisibleRangeRenderer({
				core,
				metrics,
				contentContainer: contentSpacer,
				getLineDecorations,
			})

			// Set initial viewport
			core.updateViewport({
				scrollTop: 0,
				scrollLeft: 0,
				viewportWidth: scrollContainer.clientWidth,
				viewportHeight: scrollContainer.clientHeight,
			})

			// Wire events
			scrollContainer.addEventListener('scroll', onScroll, { passive: true })
			scrollContainer.addEventListener('mousedown', onMouseDown)
			// On window, so a drag that leaves the editor still tracks and still
			// ends when the button is released outside it.
			window.addEventListener('mousemove', onMouseMove)
			window.addEventListener('mouseup', onMouseUp)

			resizeObserver = new ResizeObserver(onResize)
			resizeObserver.observe(scrollContainer)
		},

		detach() {
			if (scrollContainer) {
				scrollContainer.removeEventListener('scroll', onScroll)
				scrollContainer.removeEventListener('mousedown', onMouseDown)
			}
			window.removeEventListener('mousemove', onMouseMove)
			window.removeEventListener('mouseup', onMouseUp)
			selecting = false
			resizeObserver?.disconnect()
			resizeObserver = null
			renderer?.destroy()
			renderer = null
			scrollContainer?.remove()
			scrollContainer = null
			contentSpacer = null
			textarea?.remove()
			textarea = null
			host = null
		},

		flush(dirty: EditorDirtyState): FlushReceipt {
			if (!renderer || destroyed) {
				return {
					identity: dirty.identity,
					docVersion: dirty.docVersion,
					rowsUpdated: 0,
					overlayUpdated: false,
					gutterUpdated: false,
					durationMicros: 0,
				}
			}

			// Apply scroll anchoring before row flush
			applyScrollAnchor(dirty)

			// Track theme/decoration versions from dirty state
			const versions = core.getVersions()
			themeVersion = versions.themeVersion
			decorationRevision = versions.decorationVersion

			const result = renderer.flush(dirty, themeVersion, decorationRevision)

			// The flush sizes the content spacer, so a scroll offset requested
			// before there was anything to scroll can finally be applied.
			applyPendingScroll()

			return {
				identity: dirty.identity,
				docVersion: dirty.docVersion,
				rowsUpdated: result.rowsUpdated,
				overlayUpdated: result.overlayUpdated,
				gutterUpdated: result.gutterUpdated,
				durationMicros: 0, // Set by FrameScheduler
			}
		},

		getTextarea() {
			return textarea
		},

		setScrollPosition(scrollTop: number, scrollLeft: number) {
			if (!scrollContainer) return
			pendingScrollTop = scrollTop
			pendingScrollLeft = scrollLeft
			// The browser clamps to the scrollable range, and the resulting
			// scroll event syncs the clamped value back into the core.
			applyPendingScroll()
		},

		getCaretRect(lineIndex: number, column: number): CaretRect {
			const lineText = core.getLineText(lineIndex)
			// Container-relative, matching positionFromClientPoint. The spacer's
			// rect already includes the scroll offset.
			const contentTop = scrollContainer?.getBoundingClientRect().top ?? 0
			const scrollTop = scrollContainer?.scrollTop ?? 0
			return getCaretRect(lineText, column, lineIndex, contentTop, scrollTop, metrics)
		},

		xToColumn(lineIndex: number, x: number): number {
			const lineText = core.getLineText(lineIndex)
			const gutterWidth = renderer?.getGutterWidth() ?? 0
			return xToColumn(lineText, x - gutterWidth, metrics)
		},

		lineFromClientY(clientY: number): number {
			// Container-relative; see positionFromClientPoint.
			const contentTop = scrollContainer?.getBoundingClientRect().top ?? 0
			const scrollTop = scrollContainer?.scrollTop ?? 0
			return lineFromClientY(clientY, contentTop, scrollTop, metrics.lineHeight, core.getLineCount())
		},

		getMetrics() {
			return { ...metrics }
		},

		getGutterWidth() {
			return renderer?.getGutterWidth() ?? 0
		},

		remeasureFont() {
			if (!host) return
			const measured = measureFont(host)
			metrics = {
				...metrics,
				charWidth: measured.charWidth,
				lineHeight: measured.lineHeight,
			}
			renderer?.setMetrics(metrics)
			renderer?.invalidateAll()
		},

		destroy() {
			if (destroyed) return
			destroyed = true
			this.detach()
		},
	}
}
