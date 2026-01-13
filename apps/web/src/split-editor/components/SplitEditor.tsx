/**
 * SplitEditor Root Component
 *
 * Renders the recursive split layout tree and provides layout context to children.
 * Uses portals for pane content to enable future drag-and-drop functionality.
 */

import { createContext, useContext, onMount, onCleanup, type JSX } from 'solid-js'
import { SplitNode } from './SplitNode'
import { PanePortals } from './PanePortals'
import { createSplitEditorKeymap } from '../createSplitEditorKeymap'
import { CONTAINMENT_MODE } from '../constants'
import type { LayoutManager } from '../createLayoutManager'
import type { EditorPane, Tab } from '../types'

const LayoutContext = createContext<LayoutManager>()

export { LayoutContext }

export function useLayoutManager(): LayoutManager {
	const ctx = useContext(LayoutContext)
	if (!ctx) {
		throw new Error('useLayoutManager must be used within a SplitEditor')
	}
	return ctx
}

export interface SplitEditorProps {
	layoutManager: LayoutManager
	class?: string
	renderTabContent?: (tab: Tab, pane: EditorPane) => JSX.Element
	enableKeyboardShortcuts?: boolean
}

export function SplitEditor(props: SplitEditorProps) {
	// Set up keyboard shortcuts
	onMount(() => {
		if (props.enableKeyboardShortcuts !== false) {
			const keymap = createSplitEditorKeymap(props.layoutManager)
			const detach = keymap.attach()
			onCleanup(detach)
		}
	})

	return (
		<LayoutContext.Provider value={props.layoutManager}>
			<div
				class={`split-editor h-full w-full ${props.class ?? ''}`}
				style={{ contain: CONTAINMENT_MODE }}
			>
				<SplitNode nodeId={props.layoutManager.state.rootId} />
				<PanePortals renderTabContent={props.renderTabContent} />
			</div>
		</LayoutContext.Provider>
	)
}
