/**
 * TabBar Component Tests
 *
 * Tests for horizontal list of tabs with horizontal scroll support for overflow.
 * Requirements: 7.8, 15.6
 * Note: Component test - USE BROWSER MODE for scroll behavior and DOM rendering
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render } from 'vitest-browser-solid'
import { page } from 'vitest/browser'
import { TabBar } from './TabBar'
import { LayoutContext } from './SplitEditor'
import { createLayoutManager } from '../createLayoutManager'
import type { EditorPane, Tab } from '../types'

describe('TabBar Component', () => {
	let layoutManager: ReturnType<typeof createLayoutManager>
	let mockPane: EditorPane

	beforeEach(() => {
		layoutManager = createLayoutManager()
		
		// Initialize layout manager and set up the pane in the store
		layoutManager.initialize()
		
		// Create a mock pane with tabs
		mockPane = {
			id: 'test-pane',
			type: 'pane',
			parentId: null,
			tabs: [
				{
					id: 'tab-1',
					content: { type: 'file', filePath: '/test/file1.txt' },
					state: { scrollTop: 0, scrollLeft: 0, scrollLineIndex: 0, scrollLineHeight: 20, selections: [], cursorPosition: { line: 0, column: 0 } },
					isDirty: false,
					viewMode: 'editor' as const,
				},
				{
					id: 'tab-2',
					content: { type: 'file', filePath: '/test/file2.js' },
					state: { scrollTop: 0, scrollLeft: 0, scrollLineIndex: 0, scrollLineHeight: 20, selections: [], cursorPosition: { line: 0, column: 0 } },
					isDirty: true,
					viewMode: 'editor' as const,
				},
				{
					id: 'tab-3',
					content: { type: 'diff' },
					state: { scrollTop: 0, scrollLeft: 0, scrollLineIndex: 0, scrollLineHeight: 20, selections: [], cursorPosition: { line: 0, column: 0 } },
					isDirty: false,
					viewMode: 'editor' as const,
				}
			] as Tab[],
			activeTabId: 'tab-1',
			viewSettings: {
				showLineNumbers: true,
				showMinimap: false,
				wordWrap: false,
				fontSize: 14
			}
		}
	})

	const renderTabBar = (pane: EditorPane = mockPane) => {
		// Inject the pane into the layout manager's store for testing
		;(layoutManager as any).state.nodes[pane.id] = pane

		return render(() => (
			<LayoutContext.Provider value={layoutManager}>
				<TabBar paneId={pane.id} />
			</LayoutContext.Provider>
		))
	}

	it('renders horizontal list of tabs', async () => {
		const screen = renderTabBar()
		
		// Check that tab bar container exists
		const tabBar = screen.getByRole('tablist', { name: /tab bar/i }) || 
		               document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()
		
		// Check that all tabs are rendered
		const tabs = document.querySelectorAll('.tab-item')
		expect(tabs).toHaveLength(3)
		
		// Check tab content
		await expect.element(page.getByText('file1.txt')).toBeVisible()
		await expect.element(page.getByText('file2.js')).toBeVisible()
		await expect.element(page.getByText('Diff')).toBeVisible()
	})

	it('supports horizontal scroll for overflow', async () => {
		// Create a pane with many tabs to test overflow
		const manyTabsPane: EditorPane = {
			...mockPane,
			id: 'many-tabs-pane',
			tabs: Array.from({ length: 20 }, (_, i) => ({
				id: `tab-${i}`,
				content: { type: 'file', filePath: `/test/very-long-filename-${i}.txt` },
				state: { scrollTop: 0, scrollLeft: 0, scrollLineIndex: 0, scrollLineHeight: 20, selections: [], cursorPosition: { line: 0, column: 0 } },
				isDirty: false,
				viewMode: 'editor' as const,
			})) as Tab[]
		}
		
		renderTabBar(manyTabsPane)
		
		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()
		
		// Check that overflow-x-auto class is applied for horizontal scrolling
		expect(tabBar?.classList.contains('overflow-x-auto')).toBe(true)
		
		// Check that all tabs are rendered (even if not visible due to overflow)
		const tabs = document.querySelectorAll('.tab-item')
		expect(tabs).toHaveLength(20)
	})

	it('applies correct styling classes', async () => {
		renderTabBar()
		
		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()
		
		// Check essential styling classes
		expect(tabBar?.classList.contains('flex')).toBe(true)
		expect(tabBar?.classList.contains('h-9')).toBe(true)
		expect(tabBar?.classList.contains('shrink-0')).toBe(true)
		expect(tabBar?.classList.contains('overflow-x-auto')).toBe(true)
		expect(tabBar?.classList.contains('border-b')).toBe(true)
		expect(tabBar?.classList.contains('border-border')).toBe(true)
		expect(tabBar?.classList.contains('bg-surface-1')).toBe(true)
	})

	it('renders empty tab bar when no tabs', async () => {
		const emptyPane: EditorPane = {
			...mockPane,
			id: 'empty-pane',
			tabs: [],
			activeTabId: null
		}
		
		renderTabBar(emptyPane)
		
		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()
		
		// Should have no tab items
		const tabs = document.querySelectorAll('.tab-item')
		expect(tabs).toHaveLength(0)
	})

	it('includes scrollbar styling classes for better UX', async () => {
		renderTabBar()

		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()

		// Scrollbar classes are on the inner scroll container (child of .tab-bar)
		const scrollContainer = tabBar?.querySelector('.scrollbar-thin')
		const hasScrollbarStyling = scrollContainer !== null

		// This test verifies the scrollbar styling is present
		expect(hasScrollbarStyling).toBe(true)
	})
})