/**
 * TabBar Component
 *
 * Renders horizontal list of tabs with horizontal scroll support for overflow.
 * Uses virtualization for performance with many tabs (50+).
 * Includes ViewModeToggle for files that support multiple view modes.
 * Requirements: 7.8, 15.6, View Mode Support, Performance Optimization
 */

import { createMemo, For, Show } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
import { useLayoutManager } from './SplitEditor'
import { TabItem } from './TabItem'
import { isPane } from '../types'
import { ViewModeToggle } from '../../fs/components/ViewModeToggle'
import { detectAvailableViewModes } from '../../fs/utils/viewModeDetection'
import { viewModeRegistry } from '../../fs/registry/ViewModeRegistry'
import type { ViewMode } from '../../fs/types/ViewMode'

export interface TabBarProps {
	paneId: string
}

// Threshold for enabling virtualization (no need for small tab counts)
const VIRTUALIZATION_THRESHOLD = 20
// Estimated tab width for virtualization (tabs have max-w-32 = 128px + padding)
const ESTIMATED_TAB_WIDTH = 140
// Overscan for smoother scrolling
const TAB_OVERSCAN = 5

export function TabBar(props: TabBarProps) {
	const layout = useLayoutManager()
	let scrollElement: HTMLDivElement | null = null

	const pane = createMemo(() => {
		const node = layout.state.nodes[props.paneId]
		return node && isPane(node) ? node : null
	})

	const tabs = createMemo(() => pane()?.tabs ?? [])
	const activeTabId = createMemo(() => pane()?.activeTabId ?? null)
	const tabCount = createMemo(() => tabs().length)

	// Only use virtualization when we have many tabs
	const useVirtualization = createMemo(
		() => tabCount() >= VIRTUALIZATION_THRESHOLD
	)

	const activeTab = createMemo(() => {
		const id = activeTabId()
		return tabs().find((t) => t.id === id)
	})

	const currentFilePath = createMemo(() => {
		const tab = activeTab()
		if (tab && tab.content.type === 'file' && tab.content.filePath) {
			return tab.content.filePath
		}
		return null
	})

	const currentViewMode = createMemo((): ViewMode => {
		const tab = activeTab()
		return tab?.viewMode ?? 'editor'
	})

	// Get available view modes for current file
	const availableViewModes = createMemo(() => {
		const path = currentFilePath()
		if (!path) return []

		const modes = detectAvailableViewModes(path, undefined)
		return modes
			.map((mode) => viewModeRegistry.getViewMode(mode))
			.filter((mode): mode is NonNullable<typeof mode> => mode !== undefined)
	})

	// Handle view mode selection
	const handleViewModeSelect = (newViewMode: ViewMode) => {
		const tab = activeTab()
		if (tab) {
			layout.setTabViewMode(props.paneId, tab.id, newViewMode)
		}
	}

	// Horizontal virtualizer for tabs
	const tabVirtualizer = createVirtualizer({
		get count() {
			return tabCount()
		},
		get enabled() {
			return useVirtualization()
		},
		getScrollElement: () => scrollElement,
		estimateSize: () => ESTIMATED_TAB_WIDTH,
		horizontal: true,
		overscan: TAB_OVERSCAN,
	})

	const virtualTabs = () => tabVirtualizer.getVirtualItems()
	const totalWidth = () => tabVirtualizer.getTotalSize()

	return (
		<div class="tab-bar flex h-9 shrink-0 bg-surface-1">
			<div
				ref={(el) => {
					scrollElement = el
				}}
				class="flex flex-1 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-surface-3"
			>
				<Show
					when={useVirtualization()}
					fallback={
						// Simple rendering for small tab counts
						<For each={tabs()}>
							{(tab) => (
								<TabItem
									tab={tab}
									paneId={props.paneId}
									isActive={activeTabId() === tab.id}
								/>
							)}
						</For>
					}
				>
					<div class="relative h-full" style={{ width: `${totalWidth()}px` }}>
						<For each={virtualTabs()}>
							{(virtualItem) => {
								const tab = () => tabs()[virtualItem.index]
								return (
									<Show when={tab()}>
										<div
											class="absolute top-0 h-full"
											style={{
												left: `${virtualItem.start}px`,
												width: `${virtualItem.size}px`,
											}}
										>
											<TabItem
												tab={tab()!}
												paneId={props.paneId}
												isActive={activeTabId() === tab()!.id}
											/>
										</div>
									</Show>
								)
							}}
						</For>
					</div>
				</Show>
			</div>

			<Show when={currentFilePath()}>
				<ViewModeToggle
					currentPath={currentFilePath()!}
					currentViewMode={currentViewMode()}
					availableModes={availableViewModes()}
					onModeSelect={handleViewModeSelect}
				/>
			</Show>
		</div>
	)
}
