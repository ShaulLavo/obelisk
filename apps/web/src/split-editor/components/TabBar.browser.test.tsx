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
import { createFileContent, createDiffContent } from '../types'

describe('TabBar Component', () => {
	let layoutManager: ReturnType<typeof createLayoutManager>

	beforeEach(() => {
		layoutManager = createLayoutManager()
		// Initialize layout manager - creates root pane
		layoutManager.initialize()
	})

	const renderTabBarWithTabs = async () => {
		const paneId = layoutManager.state.rootId

		// Add tabs using the proper API
		layoutManager.openTab(paneId, createFileContent('/test/file1.txt'))
		layoutManager.openTab(paneId, createFileContent('/test/file2.js'))
		layoutManager.openTab(paneId, createDiffContent({
			originalPath: '/test/original.txt',
			modifiedPath: '/test/modified.txt',
		}))

		const result = render(() => (
			<LayoutContext.Provider value={layoutManager}>
				<TabBar paneId={paneId} />
			</LayoutContext.Provider>
		))

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 100))

		return { ...result, paneId }
	}

	const renderTabBarEmpty = async () => {
		const paneId = layoutManager.state.rootId

		const result = render(() => (
			<LayoutContext.Provider value={layoutManager}>
				<TabBar paneId={paneId} />
			</LayoutContext.Provider>
		))

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 100))

		return { ...result, paneId }
	}

	const renderTabBarWithManyTabs = async (count: number) => {
		const paneId = layoutManager.state.rootId

		// Add many tabs
		for (let i = 0; i < count; i++) {
			layoutManager.openTab(paneId, createFileContent(`/test/very-long-filename-${i}.txt`))
		}

		const result = render(() => (
			<LayoutContext.Provider value={layoutManager}>
				<TabBar paneId={paneId} />
			</LayoutContext.Provider>
		))

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 100))

		return { ...result, paneId }
	}

	it('renders horizontal list of tabs', async () => {
		await renderTabBarWithTabs()

		// Check that tab bar container exists
		const tabBar = document.querySelector('.tab-bar')
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
		await renderTabBarWithManyTabs(20)

		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()

		// Check that overflow-x-auto class is applied on the inner scroll container (child of .tab-bar)
		const scrollContainer = tabBar?.querySelector('.overflow-x-auto')
		expect(scrollContainer).toBeTruthy()

		// Check that tabs are rendered (virtualization kicks in at 20+ tabs, so not all may be visible)
		const tabs = document.querySelectorAll('.tab-item')
		expect(tabs.length).toBeGreaterThan(0)
	})

	it('applies correct styling classes', async () => {
		await renderTabBarWithTabs()

		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()

		// Check essential styling classes on the .tab-bar container
		expect(tabBar?.classList.contains('flex')).toBe(true)
		expect(tabBar?.classList.contains('h-9')).toBe(true)
		expect(tabBar?.classList.contains('shrink-0')).toBe(true)
		expect(tabBar?.classList.contains('bg-surface-1')).toBe(true)

		// Check that overflow-x-auto is on the inner scroll container (child)
		const scrollContainer = tabBar?.querySelector('.overflow-x-auto')
		expect(scrollContainer).toBeTruthy()
	})

	it('renders empty tab bar when no tabs', async () => {
		await renderTabBarEmpty()

		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()

		// Should have no tab items
		const tabs = document.querySelectorAll('.tab-item')
		expect(tabs).toHaveLength(0)
	})

	it('includes scrollbar styling classes for better UX', async () => {
		await renderTabBarWithTabs()

		const tabBar = document.querySelector('.tab-bar')
		expect(tabBar).toBeTruthy()

		// Scrollbar classes are on the inner scroll container (child of .tab-bar)
		const scrollContainer = tabBar?.querySelector('.scrollbar-thin')
		const hasScrollbarStyling = scrollContainer !== null

		// This test verifies the scrollbar styling is present
		expect(hasScrollbarStyling).toBe(true)
	})
})