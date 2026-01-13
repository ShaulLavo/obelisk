/**
 * TabItem Component Tests
 *
 * Tests for individual tab items showing file name, dirty indicator, and close button.
 * Handles click to setActiveTab and close button click to closeTab.
 * Requirements: 7.9, 7.10, 7.11, 14.4
 * Note: Component test - USE BROWSER MODE for click interactions and visual indicators
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from 'vitest-browser-solid'
import { page } from 'vitest/browser'
import { TabItem } from './TabItem'
import { LayoutContext } from './SplitEditor'
import { createLayoutManager } from '../createLayoutManager'
import type { Tab } from '../types'

describe('TabItem Component', () => {
	let layoutManager: ReturnType<typeof createLayoutManager>
	let mockTab: Tab

	beforeEach(() => {
		layoutManager = createLayoutManager()

		// Spy on layout manager methods using vi.spyOn pattern
		vi.spyOn(layoutManager, 'setActiveTab')
		vi.spyOn(layoutManager, 'closeTab')

		mockTab = {
			id: 'test-tab',
			content: { type: 'file', filePath: '/test/example.js' },
			state: {
				scrollTop: 0,
				scrollLeft: 0,
				scrollLineIndex: 0,
				scrollLineHeight: 20,
				selections: [],
				cursorPosition: { line: 0, column: 0 },
			},
			isDirty: false,
			viewMode: 'editor' as const,
		}
	})

	const renderTabItem = (
		tab: Tab = mockTab,
		isActive = false,
		paneId = 'test-pane'
	) => {
		return render(() => (
			<LayoutContext.Provider value={layoutManager}>
				<TabItem tab={tab} paneId={paneId} isActive={isActive} />
			</LayoutContext.Provider>
		))
	}

	it('shows file name from content', async () => {
		renderTabItem()

		// Should show just the filename, not the full path
		await expect.element(page.getByText('example.js')).toBeVisible()
		// Check that full path is not visible (should not throw if not found)
		const fullPathElements = document.querySelectorAll('*')
		const hasFullPath = Array.from(fullPathElements).some((el) =>
			el.textContent?.includes('/test/example.js')
		)
		expect(hasFullPath).toBe(false)
	})

	it('shows different content types correctly', async () => {
		// Test file content
		const fileTab: Tab = {
			...mockTab,
			content: { type: 'file', filePath: '/path/to/test.tsx' },
		}
		const { unmount: unmount1 } = renderTabItem(fileTab)
		await expect.element(page.getByText('test.tsx')).toBeVisible()
		unmount1()

		// Test diff content
		const diffTab: Tab = {
			...mockTab,
			content: { type: 'diff' },
		}
		const { unmount: unmount2 } = renderTabItem(diffTab)
		await expect.element(page.getByText('Diff')).toBeVisible()
		unmount2()

		// Test empty content
		const emptyTab: Tab = {
			...mockTab,
			content: { type: 'empty' },
		}
		const { unmount: unmount3 } = renderTabItem(emptyTab)
		await expect.element(page.getByText('Empty')).toBeVisible()
		unmount3()

		// Test custom content
		const customTab: Tab = {
			...mockTab,
			content: { type: 'custom' },
		}
		renderTabItem(customTab)
		await expect.element(page.getByText('Custom')).toBeVisible()
	})

	it('shows dirty indicator (dot) when isDirty', async () => {
		// Test clean tab (no dirty indicator)
		const { unmount: unmount1 } = renderTabItem({ ...mockTab, isDirty: false })
		let dirtyIndicator = document.querySelector('.bg-primary')
		expect(dirtyIndicator).toBeFalsy()
		unmount1()

		// Test dirty tab (should show dirty indicator)
		renderTabItem({ ...mockTab, isDirty: true })
		viewMode: 'editor' as const,
		dirtyIndicator = document.querySelector('.bg-primary')
		expect(dirtyIndicator).toBeTruthy()

		// Check that it's a small circular indicator
		expect(dirtyIndicator?.classList.contains('h-2')).toBe(true)
		expect(dirtyIndicator?.classList.contains('w-2')).toBe(true)
		expect(dirtyIndicator?.classList.contains('rounded-full')).toBe(true)
	})

	it('shows close button', async () => {
		const screen = renderTabItem()

		const closeButton =
			screen.getByRole('button', { name: /close/i }) ||
			document.querySelector('button[aria-label*="Close"]')
		expect(closeButton).toBeTruthy()

		// Check that it contains the X icon (SVG) using document.querySelector
		const svg = document.querySelector('button[aria-label*="Close"] svg')
		expect(svg).toBeTruthy()
		expect(svg?.classList.contains('h-3')).toBe(true)
		expect(svg?.classList.contains('w-3')).toBe(true)
	})

	it('handles click to setActiveTab', async () => {
		renderTabItem(mockTab, false, 'test-pane')

		const tabItem = document.querySelector('.tab-item')
		expect(tabItem).toBeTruthy()

		// Click on the tab item
		;(tabItem as HTMLElement)?.click()

		// Should call setActiveTab with correct parameters
		expect(layoutManager.setActiveTab).toHaveBeenCalledWith(
			'test-pane',
			'test-tab'
		)
	})

	it('handles close button click to closeTab', async () => {
		const screen = renderTabItem()

		const closeButton =
			screen.getByRole('button', { name: /close/i }) ||
			document.querySelector('button[aria-label*="Close"]')
		expect(closeButton).toBeTruthy()

		// Click on the close button
		const buttonEl = document.querySelector(
			'button[aria-label*="Close"]'
		) as HTMLButtonElement
		buttonEl?.click()

		// Should call closeTab with correct parameters
		expect(layoutManager.closeTab).toHaveBeenCalledWith('test-pane', 'test-tab')
	})

	it('prevents event propagation on close button click', async () => {
		renderTabItem()

		const closeButton = document.querySelector('button[aria-label*="Close"]')
		const tabItem = document.querySelector('.tab-item')

		expect(closeButton).toBeTruthy()
		expect(tabItem).toBeTruthy()

		// Click on the close button
		;(closeButton as HTMLButtonElement)?.click()

		// Should call closeTab but NOT setActiveTab (event should not propagate)
		expect(layoutManager.closeTab).toHaveBeenCalledWith('test-pane', 'test-tab')
		expect(layoutManager.setActiveTab).not.toHaveBeenCalled()
	})

	it('applies correct styling for active vs inactive tabs', async () => {
		// Test inactive tab
		const { unmount: unmount1 } = renderTabItem(mockTab, false)
		let tabItem = document.querySelector('.tab-item')
		expect(tabItem?.classList.contains('bg-surface-1')).toBe(true)
		expect(tabItem?.classList.contains('text-muted-foreground')).toBe(true)
		unmount1()

		// Test active tab
		renderTabItem(mockTab, true)
		tabItem = document.querySelector('.tab-item')
		expect(tabItem?.classList.contains('bg-surface-2')).toBe(true)
		expect(tabItem?.classList.contains('text-foreground')).toBe(true)
	})

	it('shows close button opacity correctly based on active state', async () => {
		// Test inactive tab (close button should be hidden by default)
		const { unmount: unmount1 } = renderTabItem(mockTab, false)
		let closeButton = document.querySelector('button[aria-label*="Close"]')
		expect(closeButton?.classList.contains('opacity-0')).toBe(true)
		unmount1()

		// Test active tab (close button should be visible)
		renderTabItem(mockTab, true)
		closeButton = document.querySelector('button[aria-label*="Close"]')
		expect(closeButton?.classList.contains('opacity-100')).toBe(true)
	})

	it('includes proper accessibility attributes', async () => {
		renderTabItem(mockTab, true)

		const tabItem = document.querySelector('.tab-item')
		expect(tabItem).toBeTruthy()

		// Check ARIA attributes
		expect(tabItem?.getAttribute('role')).toBe('tab')
		expect(tabItem?.getAttribute('aria-selected')).toBe('true')
		expect(tabItem?.getAttribute('tabindex')).toBe('0')

		// Check close button accessibility
		const closeButton = document.querySelector('button[aria-label*="Close"]')
		expect(closeButton?.getAttribute('aria-label')).toContain('Close')
		expect(closeButton?.getAttribute('aria-label')).toContain('example.js')
	})

	it('truncates long file names with title attribute', async () => {
		const longNameTab: Tab = {
			...mockTab,
			content: {
				type: 'file',
				filePath:
					'/very/long/path/to/a-very-long-filename-that-should-be-truncated.js',
			},
		}

		renderTabItem(longNameTab)

		const fileNameSpan = document.querySelector('.max-w-32.truncate')
		expect(fileNameSpan).toBeTruthy()
		expect(fileNameSpan?.getAttribute('title')).toBe(
			'a-very-long-filename-that-should-be-truncated.js'
		)
		expect(fileNameSpan?.textContent).toBe(
			'a-very-long-filename-that-should-be-truncated.js'
		)
	})
})
