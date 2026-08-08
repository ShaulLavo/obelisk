/**
 * createSolidEditorHost — bridges Solid.js reactivity to an EditorSession.
 *
 * This is the host adapter: it watches Solid accessors for config changes
 * (font size, theme, content replacement, tab switching) and translates them
 * into imperative session calls.
 *
 * It does NOT own the DOM — the session.attach/detach API handles that.
 * It does NOT own the edit/render path — that's all imperative.
 *
 * What it owns:
 * - Tracking reactive prop changes and calling session methods
 * - View state save/restore on file switch
 * - Connecting minimap as a passive observer
 */

import { createEffect, onCleanup, type Accessor } from 'solid-js'
import {
	makeEditorSession,
	type EditorSession,
	type EditorSessionConfig,
	type ViewState,
} from '../runtime/makeEditorSession'
import type { SelectionRange } from '../core/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SolidEditorHostConfig = {
	/** Document key (file path) — session is replaced when this changes. */
	documentKey: Accessor<string>
	/** Document content. */
	content: Accessor<string>
	/** Content version — increments on external replacement, forces reinitialization. */
	contentVersion?: Accessor<number>

	/** Font size in pixels. */
	fontSize: Accessor<number>
	/** Font family string. */
	fontFamily: Accessor<string>
	/** Tab size. */
	tabSize?: Accessor<number>

	/** Factory for syntax worker. */
	createWorker?: () => Worker

	/** Called on Cmd/Ctrl+S. */
	onSave?: () => void

	/** View state persistence callbacks. */
	onScrollChange?: (position: {
		scrollTop: number
		scrollLeft: number
		lineIndex: number
		lineHeight: number
	}) => void
	onCursorChange?: (position: { line: number; column: number }) => void
	onSelectionsChange?: (selections: SelectionRange[]) => void

	/** Initial view state to restore (e.g., from tab state). */
	initialViewState?: Accessor<Partial<ViewState> | undefined>
}

export type SolidEditorHost = {
	/** The underlying session. */
	readonly session: EditorSession
	/** Attach the editor view to a DOM element. Call from onMount or ref callback. */
	attach(host: HTMLElement): void
	/** Detach the editor view. Call from onCleanup. */
	detach(): void
	/** Tear down everything. */
	destroy(): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const createSolidEditorHost = (config: SolidEditorHostConfig): SolidEditorHost => {
	const tabSize = config.tabSize?.() ?? 4

	const session = makeEditorSession({
		coreConfig: {
			document: {
				key: config.documentKey(),
				content: config.content(),
			},
			tabSize,
		},
		tabSize,
		createWorker: config.createWorker,
		onSave: config.onSave,
		onScrollChange: config.onScrollChange
			? (viewport) => {
					const snapshot = session.core.getSnapshot()
					const lineStarts = snapshot.document.lineStarts
					let lineIndex = 0
					for (let i = 1; i < lineStarts.length; i++) {
						if (lineStarts[i]! * 1 > viewport.scrollTop) break
						lineIndex = i
					}
					config.onScrollChange!({
						scrollTop: viewport.scrollTop,
						scrollLeft: viewport.scrollLeft,
						lineIndex,
						lineHeight: 18, // Will be updated after attach
					})
				}
			: undefined,
		onCursorChange: config.onCursorChange,
		onSelectionsChange: config.onSelectionsChange,
	})

	let attached = false

	// Track content version for external replacements
	let lastContentVersion = config.contentVersion?.() ?? 0
	let lastDocKey = config.documentKey()
	let lastExternalContent = config.content()

	/** True when the core already holds exactly this text. */
	const coreHasContent = (text: string): boolean =>
		text.length === session.core.getDocumentLength() &&
		text === session.core.getTextRange(0, text.length)

	// --- Reactive effects (Solid-managed lifecycle) ---

	// Watch for document key changes (file switch)
	createEffect(() => {
		const newKey = config.documentKey()
		if (newKey === lastDocKey) return
		lastDocKey = newKey

		lastExternalContent = config.content()
		session.replaceDocument({
			key: newKey,
			content: lastExternalContent,
		})

		// Restore view state for the new file
		const viewState = config.initialViewState?.()
		if (viewState) {
			session.restoreViewState(viewState)
		}
	})

	// Watch for content arriving or changing outside the editor.
	// Files are commonly opened before their contents have loaded, so the
	// initial `content()` is empty and the real text arrives later.
	createEffect(() => {
		const next = config.content()
		if (next === lastExternalContent) return
		lastExternalContent = next
		// The document key effect may already have applied this text.
		if (coreHasContent(next)) return

		session.replaceDocument({
			key: config.documentKey(),
			content: next,
		})
	})

	// Watch for external content version changes
	if (config.contentVersion) {
		createEffect(() => {
			const version = config.contentVersion!()
			if (version === lastContentVersion) return
			lastContentVersion = version

			lastExternalContent = config.content()
			session.replaceDocument({
				key: config.documentKey(),
				content: lastExternalContent,
			})
		})
	}

	// Watch for font changes → remeasure
	createEffect(() => {
		// Access the signals to subscribe
		config.fontSize()
		config.fontFamily()

		if (attached) {
			session.remeasureFont()
		}
	})

	// Auto-cleanup on Solid disposal
	onCleanup(() => {
		session.destroy()
	})

	return {
		session,

		attach(host: HTMLElement) {
			if (attached) return
			attached = true
			session.attach(host)

			// Restore initial view state after attach
			const viewState = config.initialViewState?.()
			if (viewState) {
				session.restoreViewState(viewState)
			}
		},

		detach() {
			if (!attached) return
			attached = false
			session.detach()
		},

		destroy() {
			attached = false
			session.destroy()
		},
	}
}
