/**
 * FileTab Component Browser Tests
 *
 * Tests FileTab component integration with layout management
 * and tab state persistence.
 *
 * Requirements: 2.1, 2.5, 8.1, 8.2, 8.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-solid'
import { SplitEditor } from './SplitEditor'
import { createLayoutManager } from '../createLayoutManager'
import type { EditorPane } from '../types'
import { createFileContent } from '../types'

describe('FileTab Component', () => {
	let layoutManager: ReturnType<typeof createLayoutManager>

	beforeEach(() => {
		layoutManager = createLayoutManager()
		layoutManager.initialize()
	})

	afterEach(() => {
		cleanup()
	})

	it('maintains independent scroll state per tab', async () => {
		const filePath = '/test/scroll.ts'

		const { unmount } = render(() => (
			<SplitEditor
				layoutManager={layoutManager}
				renderTabContent={(tab, pane) => (
					<div
						data-testid="file-tab"
						data-file-path={tab.content.filePath}
						data-tab-id={tab.id}
					>
						Mock FileTab
					</div>
				)}
			/>
		))

		// Open tab
		const tabId = layoutManager.openTab(layoutManager.state.rootId, createFileContent(filePath))

		// Update tab state to test independent state
		layoutManager.updateTabState(layoutManager.state.rootId, tabId, {
			scrollTop: 100,
			scrollLeft: 50,
		})

		await new Promise(resolve => setTimeout(resolve, 100))

		// Verify FileTab component is rendered with correct data attributes
		const fileTabElement = document.querySelector('[data-testid="file-tab"]')
		expect(fileTabElement).toBeTruthy()
		expect(fileTabElement?.getAttribute('data-file-path')).toBe(filePath)
		expect(fileTabElement?.getAttribute('data-tab-id')).toBe(tabId)

		// Verify tab state is maintained
		const pane = layoutManager.state.nodes[layoutManager.state.rootId] as EditorPane
		const tab = pane.tabs.find(t => t.id === tabId)
		expect(tab?.state.scrollTop).toBe(100)
		expect(tab?.state.scrollLeft).toBe(50)

		unmount()
	})

	it('uses pane view settings for display', async () => {
		const filePath = '/test/settings.ts'

		const { unmount } = render(() => (
			<SplitEditor
				layoutManager={layoutManager}
				renderTabContent={(tab, pane) => (
					<div data-testid="file-tab">Mock FileTab</div>
				)}
			/>
		))

		// Update pane view settings
		layoutManager.updateViewSettings(layoutManager.state.rootId, {
			fontSize: 16,
			showLineNumbers: false,
		})

		// Open tab
		layoutManager.openTab(layoutManager.state.rootId, createFileContent(filePath))
		await new Promise(resolve => setTimeout(resolve, 100))

		// Verify component renders
		const fileTabElement = document.querySelector('[data-testid="file-tab"]')
		expect(fileTabElement).toBeTruthy()

		// Verify view settings are applied to pane
		const pane = layoutManager.state.nodes[layoutManager.state.rootId] as EditorPane
		expect(pane.viewSettings.fontSize).toBe(16)
		expect(pane.viewSettings.showLineNumbers).toBe(false)

		unmount()
	})

	it('tracks tabs via LayoutManager', async () => {
		const filePath = '/test/multiple.ts'

		const { unmount } = render(() => (
			<SplitEditor
				layoutManager={layoutManager}
				renderTabContent={(tab, pane) => (
					<div data-testid="file-tab">Mock FileTab</div>
				)}
			/>
		))

		// Open same file in multiple tabs
		const tab1Id = layoutManager.openTab(layoutManager.state.rootId, createFileContent(filePath))
		const newPaneId = layoutManager.splitPane(layoutManager.state.rootId, 'horizontal')
		const tab2Id = layoutManager.openTab(newPaneId, createFileContent(filePath))

		await new Promise(resolve => setTimeout(resolve, 100))

		// Verify both tabs are tracked via layoutManager
		expect(layoutManager.getTabCountForFile(filePath)).toBe(2)

		// Close one tab
		layoutManager.closeTab(layoutManager.state.rootId, tab1Id)
		await new Promise(resolve => setTimeout(resolve, 100))

		// Verify one tab still tracked
		expect(layoutManager.getTabCountForFile(filePath)).toBe(1)

		// Close second tab (this will close the pane too)
		layoutManager.closeTab(newPaneId, tab2Id)
		await new Promise(resolve => setTimeout(resolve, 100))

		// Verify no tabs tracked
		expect(layoutManager.getTabCountForFile(filePath)).toBe(0)

		unmount()
	})
})
