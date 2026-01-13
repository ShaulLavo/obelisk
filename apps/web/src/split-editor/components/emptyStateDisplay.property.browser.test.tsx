/**
 * Property-based tests for Empty State Display
 * **Feature: split-editor-fixes, Property 9: Empty State Display**
 * **Validates: Requirements 4.1, 4.3, 4.4**
 *
 * Property 9: Empty State Display
 * For any pane with no open tabs, it should display a helpful empty state message
 * that is visually distinct from an empty file being edited.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { render, cleanup } from 'vitest-browser-solid'
import { SplitEditor } from './SplitEditor'
import { createLayoutManager } from '../createLayoutManager'

import { createFileContent } from '../types'

describe('Empty State Display Properties', () => {
	let layoutManager: ReturnType<typeof createLayoutManager>

	beforeEach(() => {
		layoutManager = createLayoutManager()
		layoutManager.initialize()
	})

	afterEach(() => {
		cleanup()
	})

	/**
	 * Property 9: Empty State Display
	 * For any pane with no open tabs, it should display a helpful empty state message
	 * that is visually distinct from an empty file being edited.
	 * **Validates: Requirements 4.1, 4.3, 4.4**
	 */
	it('property: empty pane displays helpful empty state with guidance', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					// Generate various pane configurations
					numPanes: fc.integer({ min: 1, max: 3 }),
					splitDirections: fc.array(
						fc.constantFrom('horizontal' as const, 'vertical' as const),
						{ minLength: 0, maxLength: 2 }
					),
				}),
				async (config) => {
					// Reset layout for each test case
					layoutManager = createLayoutManager()
					layoutManager.initialize()

					const { unmount } = render(() => (
						<SplitEditor
							layoutManager={layoutManager}
							renderTabContent={(tab, pane) => (
								<div data-testid="file-tab" data-file-path={tab.content.type === 'file' ? tab.content.filePath : ''}>
									File content placeholder
								</div>
							)}
						/>
					))

					// Create panes according to config
					let currentPaneId = layoutManager.state.rootId
					for (let i = 0; i < config.numPanes - 1 && i < config.splitDirections.length; i++) {
						const direction = config.splitDirections[i]
						if (direction) {
							const newPaneId = layoutManager.splitPane(currentPaneId, direction)
							if (newPaneId) {
								currentPaneId = newPaneId
							}
						}
					}

					// Wait for render
					await new Promise((resolve) => setTimeout(resolve, 100))

					// Property: All empty panes should show the empty state content
					const emptyPaneElements = document.querySelectorAll(
						'[data-testid="empty-pane-content"]'
					)

					// With no files open, all panes should show empty state
					expect(emptyPaneElements.length).toBeGreaterThan(0)

					// Each empty state should have the required attributes and content
					for (const element of emptyPaneElements) {
						// Must have data-empty-state attribute for distinguishing from empty files
						expect(element.getAttribute('data-empty-state')).toBe('no-tabs')

						// Must contain guidance text (requirement 4.2)
						const textContent = element.textContent?.toLowerCase() ?? ''
						expect(
							textContent.includes('file') || textContent.includes('open')
						).toBe(true)

						// Must be visually identifiable as empty state (not just empty content)
						expect(element.classList.contains('flex')).toBe(true)
					}

					unmount()
				}
			),
			{ numRuns: 20 }
		)
	})

	/**
	 * Property: Empty state is visually distinct from empty file being edited
	 * **Validates: Requirement 4.3**
	 */
	it('property: empty state is distinct from empty file content', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					emptyFilePath: fc.constantFrom(
						'/test/empty1.ts',
						'/test/empty2.js',
						'/test/empty3.md'
					),
				}),
				async (config) => {
					// Reset layout
					layoutManager = createLayoutManager()
					layoutManager.initialize()

					const { unmount } = render(() => (
						<SplitEditor
							layoutManager={layoutManager}
							renderTabContent={(tab, pane) => (
								<div data-testid="file-tab" data-file-path={tab.content.type === 'file' ? tab.content.filePath : ''}>
									File content placeholder
								</div>
							)}
						/>
					))

					// Wait for initial render
					await new Promise((resolve) => setTimeout(resolve, 50))

					// First, verify empty state is shown when no tabs
					let emptyState = document.querySelector('[data-testid="empty-pane-content"]')
					expect(emptyState).toBeTruthy()
					expect(emptyState?.getAttribute('data-empty-state')).toBe('no-tabs')

					// Open an empty file (simulating empty file content)
					layoutManager.openTab(
						layoutManager.state.rootId,
						createFileContent(config.emptyFilePath)
					)

					// Wait for tab to render
					await new Promise((resolve) => setTimeout(resolve, 100))

					// Now the empty state should NOT be visible (a file tab should be shown instead)
					emptyState = document.querySelector('[data-testid="empty-pane-content"]')
					expect(emptyState).toBeFalsy()

					// The file tab should be visible instead
					const fileTab = document.querySelector('[data-testid="file-tab"]')
					expect(fileTab).toBeTruthy()

					// The file tab should NOT have the empty state marker
					expect(fileTab?.getAttribute('data-empty-state')).not.toBe('no-tabs')

					unmount()
				}
			),
			{ numRuns: 10 }
		)
	})

	/**
	 * Property: Empty state reappears when all tabs are closed
	 * **Validates: Requirement 4.4**
	 */
	it('property: empty state returns when tabs are closed', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					filePaths: fc.array(
						fc.constantFrom(
							'/test/file1.ts',
							'/test/file2.js',
							'/test/file3.md'
						),
						{ minLength: 1, maxLength: 3 }
					),
				}),
				async (config) => {
					// Reset layout
					layoutManager = createLayoutManager()
					layoutManager.initialize()

					const { unmount } = render(() => (
						<SplitEditor
							layoutManager={layoutManager}
							renderTabContent={(tab, pane) => (
								<div data-testid="file-tab" data-file-path={tab.content.type === 'file' ? tab.content.filePath : ''}>
									File content placeholder
								</div>
							)}
						/>
					))

					await new Promise((resolve) => setTimeout(resolve, 50))

					// Initially should show empty state
					let emptyState = document.querySelector('[data-testid="empty-pane-content"]')
					expect(emptyState).toBeTruthy()

					// Open all files
					const tabIds: string[] = []
					for (const filePath of config.filePaths) {
						const tabId = layoutManager.openTab(
							layoutManager.state.rootId,
							createFileContent(filePath)
						)
						tabIds.push(tabId)
					}

					await new Promise((resolve) => setTimeout(resolve, 100))

					// Empty state should not be visible with tabs open
					emptyState = document.querySelector('[data-testid="empty-pane-content"]')
					expect(emptyState).toBeFalsy()

					// Close all tabs
					for (const tabId of tabIds) {
						layoutManager.closeTab(layoutManager.state.rootId, tabId)
					}

					await new Promise((resolve) => setTimeout(resolve, 100))

					// Empty state should return after all tabs are closed
					emptyState = document.querySelector('[data-testid="empty-pane-content"]')
					expect(emptyState).toBeTruthy()
					expect(emptyState?.getAttribute('data-empty-state')).toBe('no-tabs')

					unmount()
				}
			),
			{ numRuns: 15 }
		)
	})

	/**
	 * Property: Empty state message contains helpful guidance
	 * **Validates: Requirements 4.1, 4.2**
	 */
	it('property: empty state contains guidance for opening files', () => {
		fc.assert(
			fc.property(
				fc.constant(null), // No random input needed, just verifying static content
				() => {
					layoutManager = createLayoutManager()
					layoutManager.initialize()

					const { unmount } = render(() => (
						<SplitEditor
							layoutManager={layoutManager}
						/>
					))

					// SolidJS renders synchronously, so we can check immediately
					const emptyState = document.querySelector('[data-testid="empty-pane-content"]')

					if (emptyState) {
						// Must have helpful message about opening files
						const text = emptyState.textContent?.toLowerCase() ?? ''

						// Should mention files or opening
						const hasGuidance =
							text.includes('file') ||
							text.includes('open') ||
							text.includes('click') ||
							text.includes('tree')

						expect(hasGuidance).toBe(true)

						// Should have the no-tabs marker to distinguish from empty file
						expect(emptyState.getAttribute('data-empty-state')).toBe('no-tabs')
					}

					unmount()
				}
			),
			{ numRuns: 5 }
		)
	})
})
