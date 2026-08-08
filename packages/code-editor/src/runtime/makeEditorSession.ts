/**
 * makeEditorSession — top-level orchestrator for the imperative editor runtime.
 *
 * Wires together:
 *   EditorCore → FrameScheduler → EditorView
 *   EditorCore → WorkerBridge → DecorationStore
 *   EditorView → InputController
 *   EditorCore → DisplayModel (folds + width scan)
 *
 * The session is the single entry point that host adapters (Solid, etc.) use.
 * It owns the lifecycle of all subsystems and exposes a minimal API.
 *
 * Framework-free. No Solid, no DOM (until attach is called).
 */

import type {
	EditorCore,
	EditorCoreConfig,
	FlushReceipt,
	ViewportState,
	EditorTransaction,
	DispatchResult,
	EditorSnapshot,
	SelectionRange,
} from '../core/types'
import { makeEditorCore } from '../core/makeEditorCore'
import { makeFrameScheduler } from './makeFrameScheduler'
import type { FrameScheduler } from '../core/types'
import { makeEditorView, type EditorView } from '../view/makeEditorView'
import { makeInputController, type InputController } from '../input/makeInputController'
import { makeDecorationStore, type DecorationStore } from '../core/decorations/makeDecorationStore'
import { makeWorkerBridge, type WorkerBridge } from './makeWorkerBridge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorSessionConfig = {
	/** Initial document config for EditorCore. */
	coreConfig: EditorCoreConfig
	/** Tab size for view and input. */
	tabSize?: number
	/** Platform detection override for keybindings. */
	isMac?: boolean
	/** Factory to create the syntax worker. Omit to skip worker integration. */
	createWorker?: () => Worker
	/** Called on Cmd/Ctrl+S. */
	onSave?: () => void
	/** Called whenever scroll position changes. */
	onScrollChange?: (viewport: ViewportState) => void
	/** Called whenever cursor position changes (line, column). */
	onCursorChange?: (position: { line: number; column: number }) => void
	/** Called whenever selections change. */
	onSelectionsChange?: (selections: SelectionRange[]) => void
}

export type ViewState = {
	scrollTop: number
	scrollLeft: number
	cursorLine: number
	cursorColumn: number
	selections: SelectionRange[]
}

export type EditorSession = {
	/** The underlying core (read-only access for observers). */
	readonly core: EditorCore
	/** The decoration store (for minimap and other observers). */
	readonly decorationStore: DecorationStore

	/** Attach to a host DOM element — builds view, wires input. */
	attach(host: HTMLElement): void
	/** Detach from the DOM — tears down view and input. */
	detach(): void
	/** Whether the session is currently attached to the DOM. */
	isAttached(): boolean

	/** Dispatch a transaction to the core. */
	dispatch(tx: EditorTransaction): DispatchResult
	/** Get the full snapshot. */
	getSnapshot(): EditorSnapshot
	/** Get the current view state for persistence. */
	getViewState(): ViewState

	/** Restore a previously saved view state. */
	restoreViewState(state: Partial<ViewState>): void
	/** Replace the document (e.g., on file switch). */
	replaceDocument(config: EditorCoreConfig['document']): void
	/** Force remeasure after font/theme change. */
	remeasureFont(): void

	/** Subscribe to flush receipts. */
	onDidFlush(listener: (receipt: FlushReceipt) => void): () => void

	/** Tear down everything. */
	destroy(): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const makeEditorSession = (config: EditorSessionConfig): EditorSession => {
	const {
		coreConfig,
		tabSize = coreConfig.tabSize ?? 4,
		isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent),
		createWorker,
		onSave,
		onScrollChange,
		onCursorChange,
		onSelectionsChange,
	} = config

	// --- Subsystems ---
	const core = makeEditorCore(coreConfig)
	const decorationStore = makeDecorationStore()

	let view: EditorView | null = null
	let input: InputController | null = null
	let scheduler: FrameScheduler | null = null
	let workerBridge: WorkerBridge | null = null
	let unsubscribeWorkerBridge: (() => void) | null = null
	let destroyed = false

	// Track cursor/selection changes for host callbacks
	let lastCursorLine = -1
	let lastCursorColumn = -1

	/** Clamp a scroll offset to what the current document can actually scroll. */
	const clampScrollTop = (scrollTop: number): number => {
		if (!view) return Math.max(0, scrollTop)
		const { lineHeight } = view.getMetrics()
		const contentHeight = core.getLineCount() * lineHeight
		const maxScrollTop = Math.max(0, contentHeight - core.getViewport().viewportHeight)
		return Math.min(Math.max(0, scrollTop), maxScrollTop)
	}

	const notifyHostCallbacks = () => {
		const snapshot = core.getSnapshot()

		if (onScrollChange) {
			onScrollChange(snapshot.viewport)
		}

		if (onCursorChange) {
			const sel = snapshot.cursor.selections[0]
			if (sel) {
				// Convert offset to line/column
				const offset = sel.focus
				const lineStarts = snapshot.document.lineStarts
				let line = 0
				for (let i = 1; i < lineStarts.length; i++) {
					if (lineStarts[i]! > offset) break
					line = i
				}
				const column = offset - lineStarts[line]!
				if (line !== lastCursorLine || column !== lastCursorColumn) {
					lastCursorLine = line
					lastCursorColumn = column
					onCursorChange({ line, column })
				}
			}
		}

		if (onSelectionsChange) {
			onSelectionsChange(snapshot.cursor.selections)
		}
	}

	// Wire worker bridge if a worker factory is provided
	if (createWorker) {
		workerBridge = makeWorkerBridge({
			core,
			decorationStore,
			createWorker,
		})
	}

	return {
		core,
		decorationStore,

		attach(host: HTMLElement) {
			if (destroyed || view) return

			view = makeEditorView({
				core,
				tabSize,
				// Live decorations, falling back to the last usable set while a
				// reparse is in flight so text never flashes back to unstyled.
				getLineDecorations: (lineId) => {
					const decorations =
						decorationStore.getLineDecorations(lineId) ??
						decorationStore.getFallback(lineId)
					return {
						highlights: decorations?.highlightSegments ?? null,
						bracketDepths: decorations?.bracketDepths ?? null,
					}
				},
			})
			view.attach(host)

			// Create scheduler wired to the view's flush
			scheduler = makeFrameScheduler({
				core,
				flushTarget: (dirty) => view!.flush(dirty),
			})

			// Create input controller
			input = makeInputController({ core, tabSize, isMac, onSave })
			const textarea = view.getTextarea()
			if (textarea) {
				input.attach(textarea)
			}

			// Subscribe to flush receipts to notify host
			scheduler.onDidFlush(() => {
				notifyHostCallbacks()
			})

			// Wire worker bridge to core changes
			if (workerBridge) {
				unsubscribeWorkerBridge = core.onDidChange((dirty) => {
					workerBridge!.notifyChange(dirty)
				})
				// Initial parse
				workerBridge.requestParse()
			}

			// Request initial full flush
			scheduler.requestFlush('fullMeasure')
		},

		detach() {
			// Attach re-subscribes, so dropping this here keeps a detach/attach
			// cycle from stacking duplicate parse requests.
			if (unsubscribeWorkerBridge) {
				unsubscribeWorkerBridge()
				unsubscribeWorkerBridge = null
			}
			if (input) {
				input.detach()
				input.destroy()
				input = null
			}
			if (scheduler) {
				scheduler.destroy()
				scheduler = null
			}
			if (view) {
				view.destroy()
				view = null
			}
		},

		isAttached() {
			return view !== null
		},

		dispatch(tx) {
			return core.dispatch(tx)
		},

		getSnapshot() {
			return core.getSnapshot()
		},

		getViewState(): ViewState {
			const snapshot = core.getSnapshot()
			const sel = snapshot.cursor.selections[0]
			let cursorLine = 0
			let cursorColumn = 0
			if (sel) {
				const offset = sel.focus
				const lineStarts = snapshot.document.lineStarts
				for (let i = 1; i < lineStarts.length; i++) {
					if (lineStarts[i]! > offset) break
					cursorLine = i
				}
				cursorColumn = offset - lineStarts[cursorLine]!
			}
			return {
				scrollTop: snapshot.viewport.scrollTop,
				scrollLeft: snapshot.viewport.scrollLeft,
				cursorLine,
				cursorColumn,
				selections: snapshot.cursor.selections,
			}
		},

		restoreViewState(state: Partial<ViewState>) {
			if (state.scrollTop !== undefined || state.scrollLeft !== undefined) {
				const requestedTop = state.scrollTop ?? core.getViewport().scrollTop
				const scrollLeft = state.scrollLeft ?? core.getViewport().scrollLeft
				// Persisted state may outlive the file it came from. Scrolling
				// past the end would leave no lines in the visible range.
				const scrollTop = clampScrollTop(requestedTop)
				core.updateViewport({
					...core.getViewport(),
					scrollTop,
					scrollLeft,
				})
				// Keep the DOM in step — otherwise the core believes it is
				// scrolled while the container is still at the top.
				view?.setScrollPosition(scrollTop, scrollLeft)
			}
			const hasCursor =
				state.cursorLine !== undefined && state.cursorColumn !== undefined
			if (hasCursor) {
				core.dispatch({
					type: 'set-cursor-from-point',
					line: state.cursorLine!,
					column: state.cursorColumn!,
				})
			} else if (state.scrollTop !== undefined && state.scrollTop > 0) {
				// Scroll was restored but no cursor was persisted. Leaving the
				// cursor at offset 0 strands the caret above the viewport, so the
				// file looks like it has no caret at all. Put it on the first
				// visible line instead.
				const lineHeight = view?.getMetrics().lineHeight ?? 0
				if (lineHeight > 0) {
					const firstVisibleLine = Math.min(
						Math.floor(core.getViewport().scrollTop / lineHeight),
						Math.max(0, core.getLineCount() - 1)
					)
					core.dispatch({
						type: 'set-cursor-from-point',
						line: firstVisibleLine,
						column: 0,
					})
				}
			}
			if (state.selections && state.selections.length > 0) {
				const first = state.selections[0]!
				core.dispatch({
					type: 'set-selection',
					anchor: first.anchor,
					focus: first.focus,
				})
			}
			if (scheduler) {
				scheduler.requestFlush('fullMeasure')
			}
		},

		replaceDocument(doc) {
			core.dispatch({ type: 'replace-document', document: doc })
			// The core resets its scroll offset; keep the container in step.
			view?.setScrollPosition(0, 0)
			if (workerBridge) {
				workerBridge.requestParse()
			}
			if (scheduler) {
				scheduler.requestFlush('fullMeasure')
			}
		},

		remeasureFont() {
			if (view) {
				view.remeasureFont()
			}
			if (scheduler) {
				scheduler.requestFlush('fullMeasure')
			}
		},

		onDidFlush(listener) {
			if (scheduler) {
				return scheduler.onDidFlush(listener)
			}
			// If not yet attached, return a no-op unsubscribe
			return () => {}
		},

		destroy() {
			if (destroyed) return
			destroyed = true

			if (unsubscribeWorkerBridge) { unsubscribeWorkerBridge(); unsubscribeWorkerBridge = null }
			if (input) { input.detach(); input.destroy() }
			if (scheduler) scheduler.destroy()
			if (view) view.destroy()
			if (workerBridge) workerBridge.destroy()

			input = null
			scheduler = null
			view = null
			workerBridge = null
		},
	}
}
