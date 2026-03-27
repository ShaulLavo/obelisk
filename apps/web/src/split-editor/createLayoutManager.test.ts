/**
 * Unit tests for createLayoutManager split-editor orchestration.
 *
 * Tests the core state transitions: splitPane, closeTab, openTab, closePane.
 */
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createLayoutManager } from './createLayoutManager'
import { isPane, isContainer, createFileContent } from './types'

// Helper to run tests inside a SolidJS reactive root (needed for createStore/createMemo)
function withRoot<T>(fn: () => T): T {
	let result: T
	createRoot((dispose) => {
		result = fn()
		dispose()
	})
	return result!
}

describe('createLayoutManager', () => {
	describe('initialize', () => {
		it('creates a single root pane', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				expect(lm.state.rootId).toBeTruthy()
				const root = lm.state.nodes[lm.state.rootId]
				expect(root).toBeDefined()
				expect(isPane(root!)).toBe(true)
				expect(lm.state.focusedPaneId).toBe(lm.state.rootId)
			})
		})
	})

	describe('openTab', () => {
		it('adds a tab to the specified pane and makes it active', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const paneId = lm.state.rootId
				const tabId = lm.openTab(paneId, createFileContent('/test/file.ts'))

				const pane = lm.state.nodes[paneId]!
				expect(isPane(pane) && pane.tabs.length).toBe(1)
				expect(isPane(pane) && pane.activeTabId).toBe(tabId)
			})
		})

		it('opens multiple tabs; last opened is active', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const paneId = lm.state.rootId
				lm.openTab(paneId, createFileContent('/a.ts'))
				const tab2 = lm.openTab(paneId, createFileContent('/b.ts'))

				const pane = lm.state.nodes[paneId]!
				expect(isPane(pane) && pane.tabs.length).toBe(2)
				expect(isPane(pane) && pane.activeTabId).toBe(tab2)
			})
		})
	})

	describe('closeTab', () => {
		it('removes a tab and activates the next one', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const paneId = lm.state.rootId
				const tab1 = lm.openTab(paneId, createFileContent('/a.ts'))
				const tab2 = lm.openTab(paneId, createFileContent('/b.ts'))

				// Close the active tab (tab2)
				lm.closeTab(paneId, tab2)

				const pane = lm.state.nodes[paneId]!
				expect(isPane(pane) && pane.tabs.length).toBe(1)
				expect(isPane(pane) && pane.activeTabId).toBe(tab1)
			})
		})

		it('closes pane when last tab is removed (for non-root panes)', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const rootPaneId = lm.state.rootId
				lm.openTab(rootPaneId, createFileContent('/root.ts'))

				const newPaneId = lm.splitPane(rootPaneId, 'horizontal')
				const tabId = lm.openTab(newPaneId, createFileContent('/new.ts'))

				// Close the only tab in newPane -> pane should collapse
				lm.closeTab(newPaneId, tabId)

				// The new pane should no longer exist
				expect(lm.state.nodes[newPaneId]).toBeUndefined()
				// Root should be back to a single pane
				expect(isPane(lm.state.nodes[lm.state.rootId]!)).toBe(true)
			})
		})
	})

	describe('splitPane', () => {
		it('creates a container with two pane children', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const originalPaneId = lm.state.rootId
				const newPaneId = lm.splitPane(originalPaneId, 'horizontal')

				// Root should now be a container
				const root = lm.state.nodes[lm.state.rootId]!
				expect(isContainer(root)).toBe(true)
				if (isContainer(root)) {
					expect(root.direction).toBe('horizontal')
					expect(root.sizes).toEqual([0.5, 0.5])
					expect(root.children).toContain(originalPaneId)
					expect(root.children).toContain(newPaneId)
				}

				// Both children should be panes
				expect(isPane(lm.state.nodes[originalPaneId]!)).toBe(true)
				expect(isPane(lm.state.nodes[newPaneId]!)).toBe(true)
			})
		})

		it('supports vertical split direction', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				lm.splitPane(lm.state.rootId, 'vertical')

				const root = lm.state.nodes[lm.state.rootId]!
				expect(isContainer(root) && root.direction).toBe('vertical')
			})
		})

		it('supports nested splits', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const pane1 = lm.state.rootId
				const pane2 = lm.splitPane(pane1, 'horizontal')
				const pane3 = lm.splitPane(pane2, 'vertical')

				// Should have 3 panes and 2 containers
				const nodes = Object.values(lm.state.nodes)
				const panes = nodes.filter((n) => isPane(n))
				const containers = nodes.filter((n) => isContainer(n))
				expect(panes.length).toBe(3)
				expect(containers.length).toBe(2)

				// All three panes should exist
				expect(lm.state.nodes[pane1]).toBeDefined()
				expect(lm.state.nodes[pane2]).toBeDefined()
				expect(lm.state.nodes[pane3]).toBeDefined()
			})
		})
	})

	describe('closePane', () => {
		it('removes pane and its parent container, promotes sibling', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const pane1 = lm.state.rootId
				const pane2 = lm.splitPane(pane1, 'horizontal')
				const containerId = lm.state.rootId

				lm.closePane(pane2)

				// Container should be gone, pane1 should be the root
				expect(lm.state.nodes[containerId]).toBeUndefined()
				expect(lm.state.nodes[pane2]).toBeUndefined()
				expect(lm.state.rootId).toBe(pane1)
				expect(isPane(lm.state.nodes[pane1]!)).toBe(true)
			})
		})

		it('updates focusedPaneId when focused pane is closed', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const pane1 = lm.state.rootId
				const pane2 = lm.splitPane(pane1, 'horizontal')

				lm.setFocusedPane(pane2)
				expect(lm.state.focusedPaneId).toBe(pane2)

				lm.closePane(pane2)

				// Focus should move to the surviving pane
				expect(lm.state.focusedPaneId).toBe(pane1)
			})
		})

		it('does not remove the root pane', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const rootId = lm.state.rootId
				lm.closePane(rootId)

				// Root pane should still exist (no parent to collapse into)
				expect(lm.state.nodes[rootId]).toBeDefined()
				expect(lm.state.rootId).toBe(rootId)
			})
		})
	})

	describe('setActiveTab', () => {
		it('switches the active tab in a pane', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const paneId = lm.state.rootId
				const tab1 = lm.openTab(paneId, createFileContent('/a.ts'))
				lm.openTab(paneId, createFileContent('/b.ts'))

				lm.setActiveTab(paneId, tab1)

				const pane = lm.state.nodes[paneId]!
				expect(isPane(pane) && pane.activeTabId).toBe(tab1)
			})
		})
	})

	describe('moveTab', () => {
		it('moves a tab between panes', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const pane1 = lm.state.rootId
				const tab1 = lm.openTab(pane1, createFileContent('/a.ts'))
				lm.openTab(pane1, createFileContent('/b.ts'))

				const pane2 = lm.splitPane(pane1, 'horizontal')

				lm.moveTab(pane1, tab1, pane2)

				const fromPane = lm.state.nodes[pane1]!
				const toPane = lm.state.nodes[pane2]!
				expect(isPane(fromPane) && fromPane.tabs.length).toBe(1)
				expect(isPane(toPane) && toPane.tabs.length).toBe(1)
				expect(isPane(toPane) && toPane.activeTabId).toBe(tab1)
			})
		})
	})

	describe('findTabByFilePath', () => {
		it('finds a tab by its file path', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				const paneId = lm.state.rootId
				const tabId = lm.openTab(paneId, createFileContent('/hello.ts'))

				const found = lm.findTabByFilePath('/hello.ts')
				expect(found).toBeDefined()
				expect(found!.tab.id).toBe(tabId)
				expect(found!.paneId).toBe(paneId)
			})
		})

		it('returns null for unknown file path', () => {
			withRoot(() => {
				const lm = createLayoutManager()
				lm.initialize()

				expect(lm.findTabByFilePath('/not-found.ts')).toBeNull()
			})
		})
	})
})
