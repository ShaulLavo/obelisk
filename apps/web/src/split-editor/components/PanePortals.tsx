/**
 * PanePortals Component
 *
 * Renders active tab content for all panes via SolidJS portals.
 * This enables future drag-and-drop functionality where tabs
 * can be moved without remounting their content.
 *
 * The pane is agnostic to content types - consumers provide a single
 * renderTabContent function that handles all tab types.
 */

import {
	createMemo,
	createSignal,
	For,
	onMount,
	Show,
	type JSX,
} from 'solid-js'
import { Portal } from 'solid-js/web'
import { useLayoutManager } from './SplitEditor'
import { TabContent } from './TabContent'
import type { EditorPane, Tab } from '../types'
import { isPane } from '../types'

export interface PanePortalsProps {
	/**
	 * Custom renderer for tab content. If not provided, uses default TabContent component.
	 * The pane is agnostic to content types - consumers handle rendering based on tab.content.type.
	 */
	renderTabContent?: (tab: Tab, pane: EditorPane) => JSX.Element
}

export function PanePortals(props: PanePortalsProps) {
	const layout = useLayoutManager()

	return (
		<For each={layout.paneIds()}>
			{(paneId) => (
				<PanePortal paneId={paneId} renderTabContent={props.renderTabContent} />
			)}
		</For>
	)
}

interface PanePortalProps {
	paneId: string
	renderTabContent?: (tab: Tab, pane: EditorPane) => JSX.Element
}

function PanePortal(props: PanePortalProps) {
	const layout = useLayoutManager()

	const pane = createMemo(() => {
		const node = layout.state.nodes[props.paneId]
		return node && isPane(node) ? node : null
	})

	// Track activeTabId separately to ensure reactivity
	const activeTabId = createMemo(() => {
		const p = pane()
		const tabId = p?.activeTabId ?? null
		// 		console.log('[PanePortal] activeTabId memo', {
		// 			paneId: props.paneId,
		// 			activeTabId: tabId,
		// 			tabCount: p?.tabs.length,
		// 		})
		return tabId
	})

	// Track tabs array separately
	const tabs = createMemo(() => {
		const p = pane()
		return p?.tabs ?? []
	})

	// Get the active tab object
	const activeTab = createMemo(() => {
		const tabId = activeTabId()
		const tabList = tabs()
		if (!tabId) return null
		const tab = tabList.find((t) => t.id === tabId) ?? null
		// 		console.log('[PanePortal] activeTab memo', {
		// 			paneId: props.paneId,
		// 			tabId,
		// 			hasTab: !!tab,
		// 			filePath: tab?.content.type === 'file' ? tab.content.filePath : null,
		// 		})
		return tab
	})

	// Track a signal that changes when we need to re-check for the target element
	const [targetTrigger, setTargetTrigger] = createSignal(0)

	// Re-check for target element after mount and whenever the pane changes
	onMount(() => {
		// Trigger a re-check after initial mount to find DOM elements
		setTargetTrigger((n) => n + 1)
	})

	const target = createMemo(() => {
		// Depend on trigger to re-run after mount
		targetTrigger()
		// Also depend on pane to re-run when layout changes
		pane()
		return document.getElementById(`pane-target-${props.paneId}`)
	})

	return (
		<Show when={target() && pane()}>
			{(paneAccessor) => {
				const currentPane = paneAccessor()
				return (
					<Portal mount={target()!}>
						<div
							class="pane-content absolute inset-0"
							data-pane-id={props.paneId}
						>
							{/* Show active tab only - use keyed to force re-render on tab change */}
							<Show when={activeTab()} keyed>
								{(tab) => (
									<div class="absolute inset-0" data-tab-id={tab.id}>
										<Show
											when={props.renderTabContent}
											fallback={<TabContent tab={tab} pane={currentPane} />}
										>
											{(render) => render()(tab, currentPane)}
										</Show>
									</div>
								)}
							</Show>
							<Show when={tabs().length === 0}>
								<EmptyPaneContent />
							</Show>
						</div>
					</Portal>
				)
			}}
		</Show>
	)
}

function EmptyPaneContent() {
	return (
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-4 bg-background/50 text-muted-foreground"
			data-testid="empty-pane-content"
			data-empty-state="no-tabs"
		>
			<div class="flex flex-col items-center gap-2">
				<svg
					class="h-12 w-12 opacity-40"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
				<span class="text-sm font-medium">No tabs open</span>
			</div>
			<p class="max-w-[200px] text-center text-xs opacity-70">
				Click a file in the file tree to open it here
			</p>
		</div>
	)
}
