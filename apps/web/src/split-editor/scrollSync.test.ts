/**
 * Property Test: Scroll Sync Proportionality
 *
 * Property 9: Scroll Sync Proportionality
 * Link tabs, scroll one, verify proportional scroll in others
 * Validates: Requirements 10.1, 10.2, 10.4
 */

import { describe, test, expect } from 'vitest'
import fc from 'fast-check'
import { createLayoutManager } from './createLayoutManager'
import { createScrollSyncCoordinator } from './createScrollSyncCoordinator'
import type { ScrollEvent, ScrollSyncCoordinator } from './createScrollSyncCoordinator'
import type { LayoutManager } from './createLayoutManager'
import type { ScrollSyncMode, TabId } from './types'
import { createFileContent } from './types'

describe('Scroll Sync Proportionality', () => {
	test('Property 9: Link tabs, scroll one, verify proportional scroll in others', () => {
		fc.assert(
			fc.property(
				// Generate scroll sync mode
				fc.constantFrom('line', 'percentage') as fc.Arbitrary<ScrollSyncMode>,
				// Generate scroll positions
				fc.record({
					scrollTop: fc.integer({ min: 0, max: 1000 }),
					scrollLeft: fc.integer({ min: 0, max: 1000 }),
					scrollHeight: fc.integer({ min: 500, max: 2000 }),
					scrollWidth: fc.integer({ min: 500, max: 2000 }),
					clientHeight: fc.integer({ min: 300, max: 600 }),
					clientWidth: fc.integer({ min: 300, max: 600 }),
				}),
				// Generate number of tabs to link (2-4)
				fc.integer({ min: 2, max: 4 }),
				(mode, scrollData, numTabs) => {
					const layoutManager = createLayoutManager()
					layoutManager.initialize()

					const rootPaneId = layoutManager.state.rootId
					const tabIds: TabId[] = []

					// Create multiple tabs in the same pane
					for (let i = 0; i < numTabs; i++) {
						const content = createFileContent(`/test/file${i}.txt`)
						const tabId = layoutManager.openTab(rootPaneId, content)
						tabIds.push(tabId)
					}

					// Link tabs for scroll sync
					const groupId = layoutManager.linkScrollSync(tabIds, mode)

					// Verify group was created
					const groups = layoutManager.state.scrollSyncGroups
					expect(groups).toHaveLength(1)
					expect(groups[0]?.id).toBe(groupId)
					expect(groups[0]?.tabIds).toEqual(tabIds)
					expect(groups[0]?.mode).toBe(mode)

					// Create scroll sync coordinator
					const coordinator = createScrollSyncCoordinator(layoutManager)

					// Create scroll event for first tab
					const sourceTabId = tabIds[0]!
					const scrollEvent: ScrollEvent = {
						tabId: sourceTabId,
						scrollTop: scrollData.scrollTop,
						scrollLeft: scrollData.scrollLeft,
						scrollHeight: scrollData.scrollHeight,
						scrollWidth: scrollData.scrollWidth,
						clientHeight: scrollData.clientHeight,
						clientWidth: scrollData.clientWidth,
					}

					// Apply scroll to first tab
					coordinator.handleScroll(scrollEvent)

					// Verify other tabs received proportional scroll
					const allTabs = layoutManager.getAllTabs()
					const otherTabs = allTabs.filter((t) => t.tab.id !== sourceTabId)

					for (const { tab } of otherTabs) {
						if (mode === 'line') {
							// Line mode: exact same scroll position
							expect(tab.state.scrollTop).toBe(scrollData.scrollTop)
							expect(tab.state.scrollLeft).toBe(scrollData.scrollLeft)
						} else {
							// Percentage mode: proportional scroll (stored as percentage 0-1)
							const expectedTopPercentage =
								scrollData.scrollHeight > scrollData.clientHeight
									? scrollData.scrollTop / (scrollData.scrollHeight - scrollData.clientHeight)
									: 0

							const expectedLeftPercentage =
								scrollData.scrollWidth > scrollData.clientWidth
									? scrollData.scrollLeft / (scrollData.scrollWidth - scrollData.clientWidth)
									: 0

							expect(tab.state.scrollTop).toBeCloseTo(Math.max(0, expectedTopPercentage), 5)
							expect(tab.state.scrollLeft).toBeCloseTo(Math.max(0, expectedLeftPercentage), 5)
						}
					}

					// Cleanup
					coordinator.cleanup()
				}
			),
			{ numRuns: 100 }
		)
	})

	test('scroll sync only affects linked tabs', () => {
		fc.assert(
			fc.property(
				fc.constantFrom('line', 'percentage') as fc.Arbitrary<ScrollSyncMode>,
				fc.record({
					scrollTop: fc.integer({ min: 0, max: 1000 }),
					scrollLeft: fc.integer({ min: 0, max: 1000 }),
					scrollHeight: fc.integer({ min: 500, max: 2000 }),
					scrollWidth: fc.integer({ min: 500, max: 2000 }),
					clientHeight: fc.integer({ min: 300, max: 600 }),
					clientWidth: fc.integer({ min: 300, max: 600 }),
				}),
				(mode, scrollData) => {
					const layoutManager = createLayoutManager()
					layoutManager.initialize()

					const rootPaneId = layoutManager.state.rootId

					// Create 3 tabs
					const tab1Id = layoutManager.openTab(rootPaneId, createFileContent('/test/file1.txt'))
					const tab2Id = layoutManager.openTab(rootPaneId, createFileContent('/test/file2.txt'))
					const tab3Id = layoutManager.openTab(rootPaneId, createFileContent('/test/file3.txt'))

					// Link only tab1 and tab2
					layoutManager.linkScrollSync([tab1Id, tab2Id], mode)

					const coordinator = createScrollSyncCoordinator(layoutManager)

					// Get initial state of tab3
					const tab3Initial = layoutManager.getAllTabs().find((t) => t.tab.id === tab3Id)!.tab.state

					// Scroll tab1
					const scrollEvent: ScrollEvent = {
						tabId: tab1Id,
						scrollTop: scrollData.scrollTop,
						scrollLeft: scrollData.scrollLeft,
						scrollHeight: scrollData.scrollHeight,
						scrollWidth: scrollData.scrollWidth,
						clientHeight: scrollData.clientHeight,
						clientWidth: scrollData.clientWidth,
					}

					coordinator.handleScroll(scrollEvent)

					// Verify tab3 was not affected
					const tab3Final = layoutManager.getAllTabs().find((t) => t.tab.id === tab3Id)!.tab.state
					expect(tab3Final.scrollTop).toBe(tab3Initial.scrollTop)
					expect(tab3Final.scrollLeft).toBe(tab3Initial.scrollLeft)

					coordinator.cleanup()
				}
			),
			{ numRuns: 100 }
		)
	})

	test('unlinking scroll sync stops synchronization', () => {
		const layoutManager = createLayoutManager()
		layoutManager.initialize()

		const rootPaneId = layoutManager.state.rootId

		// Create 2 tabs
		const tab1Id = layoutManager.openTab(rootPaneId, createFileContent('/test/file1.txt'))
		const tab2Id = layoutManager.openTab(rootPaneId, createFileContent('/test/file2.txt'))

		// Link tabs
		const groupId = layoutManager.linkScrollSync([tab1Id, tab2Id], 'line')
		expect(layoutManager.state.scrollSyncGroups).toHaveLength(1)

		// Unlink tabs
		layoutManager.unlinkScrollSync(groupId)
		expect(layoutManager.state.scrollSyncGroups).toHaveLength(0)

		const coordinator = createScrollSyncCoordinator(layoutManager)

		// Get initial state of tab2
		const tab2Initial = layoutManager.getAllTabs().find((t) => t.tab.id === tab2Id)!.tab.state

		// Scroll tab1 (should not affect tab2 now)
		const scrollEvent: ScrollEvent = {
			tabId: tab1Id,
			scrollTop: 500,
			scrollLeft: 200,
			scrollHeight: 1000,
			scrollWidth: 1000,
			clientHeight: 400,
			clientWidth: 400,
		}

		coordinator.handleScroll(scrollEvent)

		// Verify tab2 was not affected
		const tab2Final = layoutManager.getAllTabs().find((t) => t.tab.id === tab2Id)!.tab.state
		expect(tab2Final.scrollTop).toBe(tab2Initial.scrollTop)
		expect(tab2Final.scrollLeft).toBe(tab2Initial.scrollLeft)

		coordinator.cleanup()
	})
})