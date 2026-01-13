/**
 * Property Test: Portal State Preservation (Property 10)
 *
 * Validates: Requirements 13.1, 13.4
 *
 * Property 10: Portal State Preservation
 * *For any* layout change (split, close, resize), tab content rendered via portals
 * SHALL maintain its internal state (scroll position, selections, undo history)
 * without remounting.
 *
 * Note: This is an integration test using browser mode for complex DOM state preservation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { render, cleanup } from 'vitest-browser-solid'
import { createMemo, onMount, onCleanup as solidOnCleanup } from 'solid-js'
import { createLayoutManager } from '../createLayoutManager'

import { SplitEditor } from './SplitEditor'
import type { EditorPane, Tab, SplitDirection } from '../types'

interface MountTracker {
	mounts: number
	unmounts: number
	tabId: string
	filePath: string
}

const mountTrackers = new Map<string, MountTracker>()

/**
 * A test component that tracks mount/unmount lifecycle events
 * Used to verify portal state preservation during layout changes
 */
function TrackingFileContent(props: { tab: Tab; pane: EditorPane }) {
	const filePath = createMemo(() => props.tab.content.filePath ?? 'unknown')
	const tabId = createMemo(() => props.tab.id)

	onMount(() => {
		const key = `${tabId()}-${filePath()}`
		const tracker = mountTrackers.get(key) ?? {
			mounts: 0,
			unmounts: 0,
			tabId: tabId(),
			filePath: filePath(),
		}
		tracker.mounts++
		mountTrackers.set(key, tracker)
	})

	solidOnCleanup(() => {
		const key = `${tabId()}-${filePath()}`
		const tracker = mountTrackers.get(key)
		if (tracker) {
			tracker.unmounts++
		}
	})

	return (
		<div
			class="tracking-file-content h-full w-full bg-background p-4"
			data-testid={`file-content-${tabId()}`}
			data-file-path={filePath()}
			data-tab-id={tabId()}
		>
			<span class="text-sm font-medium">{filePath()}</span>
		</div>
	)
}

describe('Portal State Preservation (Property 10)', () => {
	beforeEach(() => {
		mountTrackers.clear()
	})

	afterEach(() => {
		cleanup()
		mountTrackers.clear()
	})

	it('should not remount tab content when changing layout via split', async () => {
		const layoutManager = createLayoutManager()
		layoutManager.initialize()

		// Get the initial pane
		const initialPaneId = layoutManager.state.rootId

		// Open a file tab
		const content = { type: 'file' as const, filePath: '/test/file1.txt' }
		const tabId = layoutManager.openTab(initialPaneId, content)

		render(() => (
			<div style={{ width: '800px', height: '600px' }}>
				<SplitEditor
					layoutManager={layoutManager}
					renderTabContent={(tab, pane) => (
						<TrackingFileContent tab={tab} pane={pane} />
					)}
				/>
			</div>
		))

		// Wait for initial mount
		await new Promise((resolve) => setTimeout(resolve, 100))

		const key = `${tabId}-/test/file1.txt`
		const initialTracker = mountTrackers.get(key)

		// Verify initial mount happened
		expect(initialTracker).toBeDefined()
		expect(initialTracker!.mounts).toBe(1)
		expect(initialTracker!.unmounts).toBe(0)

		// Perform a split operation
		layoutManager.splitPane(initialPaneId, 'horizontal')

		// Wait for layout update
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Check that the original tab was NOT remounted
		const afterSplitTracker = mountTrackers.get(key)
		expect(afterSplitTracker).toBeDefined()

		// Key validation: mounts should still be 1, meaning no remount occurred
		expect(afterSplitTracker!.mounts).toBe(1)
		expect(afterSplitTracker!.unmounts).toBe(0)
	})

	it('should not remount tab content when resizing panes', async () => {
		const layoutManager = createLayoutManager()
		layoutManager.initialize()

		const initialPaneId = layoutManager.state.rootId

		// Create a split layout
		const newPaneId = layoutManager.splitPane(initialPaneId, 'horizontal')

		// Open files in both panes
		const tabId1 = layoutManager.openTab(initialPaneId, {
			type: 'file',
			filePath: '/test/left.txt',
		})
		const tabId2 = layoutManager.openTab(newPaneId, {
			type: 'file',
			filePath: '/test/right.txt',
		})

		render(() => (
			<div style={{ width: '800px', height: '600px' }}>
				<SplitEditor
					layoutManager={layoutManager}
					renderTabContent={(tab, pane) => (
						<TrackingFileContent tab={tab} pane={pane} />
					)}
				/>
			</div>
		))

		// Wait for initial mount
		await new Promise((resolve) => setTimeout(resolve, 100))

		const key1 = `${tabId1}-/test/left.txt`
		const key2 = `${tabId2}-/test/right.txt`

		// Record initial mount counts
		const initialMounts1 = mountTrackers.get(key1)!.mounts
		const initialMounts2 = mountTrackers.get(key2)!.mounts

		// Update container sizes
		const containerId = layoutManager.state.rootId
		if (layoutManager.state.nodes[containerId]?.type === 'container') {
			layoutManager.updateSplitSizes(containerId, [0.3, 0.7])
		}

		// Wait for resize update
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify no remounts occurred
		expect(mountTrackers.get(key1)!.mounts).toBe(initialMounts1)
		expect(mountTrackers.get(key2)!.mounts).toBe(initialMounts2)
		expect(mountTrackers.get(key1)!.unmounts).toBe(0)
		expect(mountTrackers.get(key2)!.unmounts).toBe(0)
	})

	it('property: multiple layout changes preserve tab state', () => {
		fc.assert(
			fc.asyncProperty(
				fc.record({
					operations: fc.array(
						fc.oneof(
							fc.record({
								type: fc.constant('split' as const),
								direction: fc.constantFrom<SplitDirection>(
									'horizontal',
									'vertical'
								),
							}),
							fc.record({
								type: fc.constant('resize' as const),
								size1: fc.float({ min: Math.fround(0.2), max: Math.fround(0.8), noNaN: true }),
							})
						),
						{ minLength: 1, maxLength: 5 }
					),
				}),
				async (config) => {
					mountTrackers.clear()

					const layoutManager = createLayoutManager()
					layoutManager.initialize()

					const initialPaneId = layoutManager.state.rootId

					// Open initial file
					const tabId = layoutManager.openTab(initialPaneId, {
						type: 'file',
						filePath: '/test/property-test.txt',
					})

					const { unmount } = render(() => (
						<div style={{ width: '800px', height: '600px' }}>
							<SplitEditor
								layoutManager={layoutManager}
								renderTabContent={(tab, pane) => (
									<TrackingFileContent tab={tab} pane={pane} />
								)}
							/>
						</div>
					))

					// Wait for initial mount
					await new Promise((resolve) => setTimeout(resolve, 50))

					const key = `${tabId}-/test/property-test.txt`
					const initialTracker = mountTrackers.get(key)

					// Verify initial mount
					expect(initialTracker).toBeDefined()
					const initialMounts = initialTracker!.mounts

					// Apply operations
					for (const op of config.operations) {
						const panes = layoutManager.paneIds()
						if (panes.length === 0) continue

						if (op.type === 'split') {
							const paneToSplit = panes[panes.length - 1]
							if (paneToSplit) {
								layoutManager.splitPane(paneToSplit, op.direction)
							}
						} else if (op.type === 'resize') {
							// Find a container to resize
							const rootNode =
								layoutManager.state.nodes[layoutManager.state.rootId]
							if (rootNode?.type === 'container') {
								layoutManager.updateSplitSizes(rootNode.id, [
									op.size1,
									1 - op.size1,
								])
							}
						}

						// Brief wait between operations
						await new Promise((resolve) => setTimeout(resolve, 20))
					}

					// Final verification: original tab should not have been remounted
					const finalTracker = mountTrackers.get(key)
					expect(finalTracker).toBeDefined()

					// The key property: mount count should not increase
					expect(finalTracker!.mounts).toBe(initialMounts)
					expect(finalTracker!.unmounts).toBe(0)

					// Cleanup
					unmount()
				}
			),
			{ numRuns: 20 }
		)
	})

	it('should preserve state when closing sibling panes', async () => {
		const layoutManager = createLayoutManager()
		layoutManager.initialize()

		const initialPaneId = layoutManager.state.rootId

		// Open a file in the initial pane
		const tabId = layoutManager.openTab(initialPaneId, {
			type: 'file',
			filePath: '/test/survivor.txt',
		})

		// Create a split with a new pane
		const newPaneId = layoutManager.splitPane(initialPaneId, 'horizontal')

		// Open a file in the new pane
		layoutManager.openTab(newPaneId, {
			type: 'file',
			filePath: '/test/to-close.txt',
		})

		render(() => (
			<div style={{ width: '800px', height: '600px' }}>
				<SplitEditor
					layoutManager={layoutManager}
					renderTabContent={(tab, pane) => (
						<TrackingFileContent tab={tab} pane={pane} />
					)}
				/>
			</div>
		))

		// Wait for initial mount
		await new Promise((resolve) => setTimeout(resolve, 100))

		const survivorKey = `${tabId}-/test/survivor.txt`
		const initialMounts = mountTrackers.get(survivorKey)!.mounts

		// Close the new pane (this changes layout structure)
		layoutManager.closePane(newPaneId)

		// Wait for layout update
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify the surviving tab was not remounted
		const finalTracker = mountTrackers.get(survivorKey)
		expect(finalTracker).toBeDefined()
		expect(finalTracker!.mounts).toBe(initialMounts)
		expect(finalTracker!.unmounts).toBe(0)
	})

	it('should render correct content for different tab types', async () => {
		const layoutManager = createLayoutManager()
		layoutManager.initialize()

		const paneId = layoutManager.state.rootId

		// Open file tab
		layoutManager.openTab(paneId, {
			type: 'file',
			filePath: '/test/myfile.txt',
		})

		render(() => (
			<div style={{ width: '800px', height: '600px' }}>
				<SplitEditor
					layoutManager={layoutManager}
				/>
			</div>
		))

		// Wait for render
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify file content placeholder is rendered
		const fileContent = document.querySelector(
			'[data-testid="file-content-placeholder"]'
		)
		expect(fileContent).toBeTruthy()
		expect(fileContent?.getAttribute('data-file-path')).toBe('/test/myfile.txt')
	})

	it('should switch content when active tab changes', async () => {
		const layoutManager = createLayoutManager()
		layoutManager.initialize()

		const paneId = layoutManager.state.rootId

		// Open two file tabs
		const tab1Id = layoutManager.openTab(paneId, {
			type: 'file',
			filePath: '/test/file1.txt',
		})
		layoutManager.openTab(paneId, {
			type: 'file',
			filePath: '/test/file2.txt',
		})

		render(() => (
			<div style={{ width: '800px', height: '600px' }}>
				<SplitEditor
					layoutManager={layoutManager}
				/>
			</div>
		))

		// Wait for render
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Tab2 should be active (last opened)
		let fileContent = document.querySelector(
			'[data-testid="file-content-placeholder"]'
		)
		expect(fileContent?.getAttribute('data-file-path')).toBe('/test/file2.txt')

		// Switch to tab1
		layoutManager.setActiveTab(paneId, tab1Id)

		// Wait for update
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Tab1 should now be active
		fileContent = document.querySelector(
			'[data-testid="file-content-placeholder"]'
		)
		expect(fileContent?.getAttribute('data-file-path')).toBe('/test/file1.txt')
	})
})
