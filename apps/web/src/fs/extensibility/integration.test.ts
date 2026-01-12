/**
 * Integration Tests for File View Modes Complete Workflow
 *
 * **Feature: file-view-modes, Task 12.1**
 *
 * Tests the complete workflow from file opening to view mode switching,
 * ensuring all components work together correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { createTabIdentity, parseTabIdentity } from '../utils/tabIdentity'
import { ViewModeRegistry } from '../registry/ViewModeRegistry'
import { detectAvailableViewModes } from '../utils/viewModeDetection'
import type { ViewMode } from '../types/ViewMode'
import type { ParseResult } from '@repo/utils'

describe('File View Modes Integration Tests', () => {
	let registry: ViewModeRegistry

	beforeEach(() => {
		registry = new ViewModeRegistry()
		// Initialize with built-in modes
		registry.register({
			id: 'editor',
			label: 'Editor',
			isAvailable: () => true,
			isDefault: true,
		})
		registry.register({
			id: 'ui',
			label: 'UI',
			isAvailable: (path) => path === '/.system/settings.json',
		})
		registry.register({
			id: 'binary',
			label: 'Binary',
			isAvailable: (path, stats) => (stats as any)?.isBinary === true,
		})
	})

	describe('Complete Workflow: Opening Files in Different View Modes', () => {
		it('should handle opening regular files in editor mode only', () => {
			const filePath = '/src/index.ts'
			const stats = { contentKind: 'text' } as unknown as ParseResult

			// Test view mode detection
			const availableModes = detectAvailableViewModes(filePath, stats)
			expect(availableModes).toEqual(['editor'])

			// Test tab creation
			const tabId = createTabIdentity(filePath, 'editor')
			expect(tabId).toBe('/src/index.ts|editor')

			// Test tab parsing
			const identity = parseTabIdentity(tabId)
			expect(identity).toEqual({ filePath: filePath, viewMode: 'editor' })
		})

		it('should handle opening settings files in both editor and ui modes', () => {
			const filePath = '/.system/settings.json'
			const stats = { contentKind: 'text' } as unknown as ParseResult

			// Test view mode detection
			const availableModes = detectAvailableViewModes(filePath, stats)
			expect(availableModes).toContain('editor')
			expect(availableModes).toContain('ui')

			// Test creating tabs for both modes
			const editorTabId = createTabIdentity(filePath, 'editor')
			const uiTabId = createTabIdentity(filePath, 'ui')

			expect(editorTabId).toBe('/.system/settings.json|editor')
			expect(uiTabId).toBe('/.system/settings.json|ui')

			// Verify they are different tabs
			expect(editorTabId).not.toBe(uiTabId)

			// Test parsing both tab IDs
			const editorIdentity = parseTabIdentity(editorTabId)
			const uiIdentity = parseTabIdentity(uiTabId)

			expect(editorIdentity).toEqual({ filePath: filePath, viewMode: 'editor' })
			expect(uiIdentity).toEqual({ filePath: filePath, viewMode: 'ui' })
		})

		it('should handle opening binary files in both editor and binary modes', () => {
			const filePath = '/assets/image.png'
			const stats = { contentKind: 'binary' } as unknown as ParseResult

			// Test view mode detection
			const availableModes = detectAvailableViewModes(filePath, stats)
			expect(availableModes).toContain('editor')
			expect(availableModes).toContain('binary')

			// Test creating tabs for both modes
			const editorTabId = createTabIdentity(filePath, 'editor')
			const binaryTabId = createTabIdentity(filePath, 'binary')

			expect(editorTabId).toBe('/assets/image.png|editor')
			expect(binaryTabId).toBe('/assets/image.png|binary')

			// Verify they are different tabs
			expect(editorTabId).not.toBe(binaryTabId)
		})
	})

	describe('Complete Workflow: Switching Between View Modes', () => {
		it('should maintain separate tab identities when switching view modes', () => {
			const filePath = '/.system/settings.json'
			const [currentTabs, setCurrentTabs] = createSignal<string[]>([])

			// Simulate opening file in editor mode
			const editorTabId = createTabIdentity(filePath, 'editor')
			setCurrentTabs([editorTabId])

			expect(currentTabs()).toEqual(['/.system/settings.json|editor'])

			// Simulate switching to UI mode (creates new tab)
			const uiTabId = createTabIdentity(filePath, 'ui')
			setCurrentTabs([...currentTabs(), uiTabId])

			expect(currentTabs()).toEqual([
				'/.system/settings.json|editor',
				'/.system/settings.json|ui',
			])

			// Verify both tabs exist for the same file
			const editorIdentity = parseTabIdentity(currentTabs()[0]!)
			const uiIdentity = parseTabIdentity(currentTabs()[1]!)

			expect(editorIdentity.filePath).toBe(filePath)
			expect(uiIdentity.filePath).toBe(filePath)
			expect(editorIdentity.viewMode).toBe('editor')
			expect(uiIdentity.viewMode).toBe('ui')
		})

		it('should handle closing specific view mode tabs without affecting others', () => {
			const filePath = '/.system/settings.json'
			const [currentTabs, setCurrentTabs] = createSignal<string[]>([
				createTabIdentity(filePath, 'editor'),
				createTabIdentity(filePath, 'ui'),
			])

			expect(currentTabs()).toHaveLength(2)

			// Close only the editor tab
			const tabToClose = createTabIdentity(filePath, 'editor')
			setCurrentTabs(currentTabs().filter((tab) => tab !== tabToClose))

			expect(currentTabs()).toHaveLength(1)
			expect(currentTabs()[0]).toBe('/.system/settings.json|ui')

			// Verify the remaining tab is the UI mode
			const remainingIdentity = parseTabIdentity(currentTabs()[0]!)
			expect(remainingIdentity.viewMode).toBe('ui')
		})
	})

	describe('Complete Workflow: Tab Management with Mixed View Modes', () => {
		it('should handle multiple files with different view modes simultaneously', () => {
			const [currentTabs, setCurrentTabs] = createSignal<string[]>([])

			// Open regular file in editor mode
			const regularFile = createTabIdentity('/src/app.ts', 'editor')
			setCurrentTabs([regularFile])

			// Open settings file in both modes
			const settingsEditor = createTabIdentity(
				'/.system/settings.json',
				'editor'
			)
			const settingsUI = createTabIdentity('/.system/settings.json', 'ui')
			setCurrentTabs([...currentTabs(), settingsEditor, settingsUI])

			// Open binary file in both modes
			const binaryEditor = createTabIdentity('/assets/logo.png', 'editor')
			const binaryViewer = createTabIdentity('/assets/logo.png', 'binary')
			setCurrentTabs([...currentTabs(), binaryEditor, binaryViewer])

			// Verify all tabs exist
			expect(currentTabs()).toHaveLength(5)

			// Verify each tab has correct identity
			const identities = currentTabs().map(parseTabIdentity)

			expect(identities).toContainEqual({
				filePath: '/src/app.ts',
				viewMode: 'editor',
			})
			expect(identities).toContainEqual({
				filePath: '/.system/settings.json',
				viewMode: 'editor',
			})
			expect(identities).toContainEqual({
				filePath: '/.system/settings.json',
				viewMode: 'ui',
			})
			expect(identities).toContainEqual({
				filePath: '/assets/logo.png',
				viewMode: 'editor',
			})
			expect(identities).toContainEqual({
				filePath: '/assets/logo.png',
				viewMode: 'binary',
			})
		})

		it('should maintain tab order and selection behavior with view modes', () => {
			const [currentTabs, setCurrentTabs] = createSignal<string[]>([])
			const [activeTab, setActiveTab] = createSignal<string | undefined>()

			// Open tabs in sequence
			const tab1 = createTabIdentity('/file1.ts', 'editor')
			const tab2 = createTabIdentity('/.system/settings.json', 'editor')
			const tab3 = createTabIdentity('/.system/settings.json', 'ui')

			setCurrentTabs([tab1, tab2, tab3])
			setActiveTab(tab3)

			expect(currentTabs()).toEqual([
				'/file1.ts|editor',
				'/.system/settings.json|editor',
				'/.system/settings.json|ui',
			])
			expect(activeTab()).toBe('/.system/settings.json|ui')

			// Close the active tab
			setCurrentTabs(currentTabs().filter((tab) => tab !== activeTab()))

			// Verify tab was removed
			expect(currentTabs()).toHaveLength(2)
			expect(currentTabs()).not.toContain('/.system/settings.json|ui')

			// Verify other settings tab still exists
			expect(currentTabs()).toContain('/.system/settings.json|editor')
		})
	})

	describe('Regular Files', () => {
		it('should only support editor mode for text files', () => {
			const regularFiles = [
				'/src/index.ts',
				'/README.md',
				'/package.json',
				'/styles.css',
			]

			for (const filePath of regularFiles) {
				const stats = { contentKind: 'text' } as unknown as ParseResult

				const availableModes = detectAvailableViewModes(filePath, stats)
				expect(availableModes).toEqual(['editor'])

				const tabId = createTabIdentity(filePath, 'editor')
				expect(tabId).toBe(`${filePath}|editor`)

				const identity = parseTabIdentity(tabId)
				expect(identity).toEqual({ filePath: filePath, viewMode: 'editor' })
			}
		})

		it('should default to editor mode when parsing tab IDs without view mode suffix', () => {
			const tabId = '/src/index.ts'

			const identity = parseTabIdentity(tabId)
			expect(identity).toEqual({
				filePath: '/src/index.ts',
				viewMode: 'editor',
			})

			const newTabId = createTabIdentity(identity.filePath, identity.viewMode)
			expect(newTabId).toBe('/src/index.ts|editor')
		})
	})
})
