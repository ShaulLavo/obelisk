/**
 * Editor — Solid.js component for the new imperative editor runtime.
 *
 * This is a thin wrapper: it creates a SolidEditorHost, mounts the session
 * into a div ref, and tears down on cleanup. All edit/render logic is imperative.
 *
 * Solid is used only for:
 * - Mount/unmount lifecycle
 * - Reactive config prop tracking (font, content version, file switch)
 * - Host wiring (persistence callbacks to parent)
 *
 * The component does NOT use Solid for rendering text, selections, or decorations.
 */

import { onMount, onCleanup, type Accessor } from 'solid-js'
import {
	createSolidEditorHost,
	type SolidEditorHostConfig,
} from './createSolidEditorHost'
import type { SelectionRange } from '../core/types'
import type { ViewState } from '../runtime/makeEditorSession'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type ImperativeEditorProps = {
	/** Document key (file path). Session resets when this changes. */
	documentKey: Accessor<string>
	/** Document content. */
	content: Accessor<string>
	/** Content version — increments on external reload. */
	contentVersion?: Accessor<number>

	/** Font size in pixels. */
	fontSize: Accessor<number>
	/** Font family. */
	fontFamily: Accessor<string>
	/** Tab size. */
	tabSize?: Accessor<number>

	/** Factory for syntax worker. */
	createWorker?: () => Worker

	/** Called on Cmd/Ctrl+S. */
	onSave?: () => void
	/** Called when scroll position changes (for persistence). */
	onScrollChange?: (position: {
		scrollTop: number
		scrollLeft: number
		lineIndex: number
		lineHeight: number
	}) => void
	/** Called when cursor position changes (for persistence). */
	onCursorChange?: (position: { line: number; column: number }) => void
	/** Called when selections change (for persistence). */
	onSelectionsChange?: (selections: SelectionRange[]) => void

	/** Initial view state to restore on mount/file switch. */
	initialViewState?: Accessor<Partial<ViewState> | undefined>

	/** CSS class for the host element. */
	class?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ImperativeEditor = (props: ImperativeEditorProps) => {
	let hostRef: HTMLDivElement | undefined

	const hostConfig: SolidEditorHostConfig = {
		documentKey: props.documentKey,
		content: props.content,
		contentVersion: props.contentVersion,
		fontSize: props.fontSize,
		fontFamily: props.fontFamily,
		tabSize: props.tabSize,
		createWorker: props.createWorker,
		onSave: props.onSave,
		onScrollChange: props.onScrollChange,
		onCursorChange: props.onCursorChange,
		onSelectionsChange: props.onSelectionsChange,
		initialViewState: props.initialViewState,
	}

	const host = createSolidEditorHost(hostConfig)

	onMount(() => {
		if (hostRef) {
			host.attach(hostRef)
		}
	})

	onCleanup(() => {
		host.detach()
	})

	return (
		<div
			ref={hostRef}
			class={props.class ?? 'editor-host'}
			style={{
				width: '100%',
				height: '100%',
				position: 'relative',
				overflow: 'hidden',
				'font-family': props.fontFamily(),
				'font-size': `${props.fontSize()}px`,
			}}
		/>
	)
}
