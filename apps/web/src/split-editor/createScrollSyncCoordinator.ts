/**
 * Scroll Sync Coordinator
 *
 * Coordinates synchronized scrolling between linked tabs.
 * Subscribes to scroll events and applies proportional scrolling to other tabs in the group.
 */

import { createEffect, createMemo, onCleanup } from 'solid-js'
import type { LayoutManager } from './createLayoutManager'
import type { ScrollSyncGroup, ScrollSyncMode, TabId } from './types'

export interface ScrollEvent {
	tabId: TabId
	scrollTop: number
	scrollLeft: number
	scrollHeight: number
	scrollWidth: number
	clientHeight: number
	clientWidth: number
}

export interface ScrollSyncCoordinator {
	handleScroll: (event: ScrollEvent) => void
	cleanup: () => void
}

export function createScrollSyncCoordinator(
	layoutManager: LayoutManager
): ScrollSyncCoordinator {
	const scrollListeners = new Map<TabId, (event: ScrollEvent) => void>()
	let isApplyingSync = false

	// Get all scroll sync groups reactively
	const scrollSyncGroups = createMemo(() => layoutManager.state.scrollSyncGroups)

	// Find which group a tab belongs to
	function findScrollSyncGroup(tabId: TabId): ScrollSyncGroup | null {
		return scrollSyncGroups().find((group) => group.tabIds.includes(tabId)) ?? null
	}

	// Calculate proportional scroll position
	function calculateProportionalScroll(
		sourceEvent: ScrollEvent,
		mode: ScrollSyncMode
	): { scrollTop: number; scrollLeft: number } {
		if (mode === 'line') {
			// Line-based sync: maintain same scroll position
			return {
				scrollTop: sourceEvent.scrollTop,
				scrollLeft: sourceEvent.scrollLeft,
			}
		} else {
			// Percentage-based sync: maintain same scroll percentage
			const scrollTopPercentage =
				sourceEvent.scrollHeight > sourceEvent.clientHeight
					? sourceEvent.scrollTop / (sourceEvent.scrollHeight - sourceEvent.clientHeight)
					: 0

			const scrollLeftPercentage =
				sourceEvent.scrollWidth > sourceEvent.clientWidth
					? sourceEvent.scrollLeft / (sourceEvent.scrollWidth - sourceEvent.clientWidth)
					: 0

			return {
				scrollTop: Math.max(0, scrollTopPercentage),
				scrollLeft: Math.max(0, scrollLeftPercentage),
			}
		}
	}

	// Apply scroll to a target tab
	function applyScrollToTab(
		targetTabId: TabId,
		scrollData: { scrollTop: number; scrollLeft: number },
		mode: ScrollSyncMode
	): void {
		// Find the tab in the layout
		const allTabs = layoutManager.getAllTabs()
		const tabInfo = allTabs.find((t) => t.tab.id === targetTabId)
		if (!tabInfo) return

		if (mode === 'line') {
			// Direct scroll position
			layoutManager.updateTabState(tabInfo.paneId, targetTabId, {
				scrollTop: scrollData.scrollTop,
				scrollLeft: scrollData.scrollLeft,
			})
		} else {
			// Percentage-based: store the percentage and let the component handle it
			layoutManager.updateTabState(tabInfo.paneId, targetTabId, {
				scrollTop: scrollData.scrollTop, // This will be a percentage (0-1)
				scrollLeft: scrollData.scrollLeft, // This will be a percentage (0-1)
			})
		}

		// Emit scroll event to the DOM element if it exists (browser only)
		if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
			const targetElement = document.querySelector(`[data-tab-id="${targetTabId}"]`)
			if (targetElement && targetElement instanceof HTMLElement) {
				if (mode === 'line') {
					targetElement.scrollTop = scrollData.scrollTop
					targetElement.scrollLeft = scrollData.scrollLeft
				} else {
					// Calculate actual scroll position from percentage
					const maxScrollTop = Math.max(0, targetElement.scrollHeight - targetElement.clientHeight)
					const maxScrollLeft = Math.max(0, targetElement.scrollWidth - targetElement.clientWidth)
					
					targetElement.scrollTop = scrollData.scrollTop * maxScrollTop
					targetElement.scrollLeft = scrollData.scrollLeft * maxScrollLeft
				}
			}
		}
	}

	// Handle scroll event from a tab
	function handleScroll(event: ScrollEvent): void {
		// Prevent infinite loops when we're applying sync
		if (isApplyingSync) return

		const group = findScrollSyncGroup(event.tabId)
		if (!group) return

		// Calculate proportional scroll
		const scrollData = calculateProportionalScroll(event, group.mode)

		// Apply to all other tabs in the group
		isApplyingSync = true
		try {
			for (const targetTabId of group.tabIds) {
				if (targetTabId !== event.tabId) {
					applyScrollToTab(targetTabId, scrollData, group.mode)
				}
			}
		} finally {
			isApplyingSync = false
		}
	}

	// Cleanup function
	function cleanup(): void {
		scrollListeners.clear()
	}

	// Clean up on component cleanup
	onCleanup(cleanup)

	return {
		handleScroll,
		cleanup,
	}
}