import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { ViewModeRegistry } from '../registry/ViewModeRegistry'
import { 
	detectAvailableViewModes, 
	getDefaultViewMode, 
	getValidViewMode,
	isViewModeValid,
	getViewModeLabel
} from '../utils/viewModeDetection'
import type { ViewMode } from '../types/ViewMode'

/**
 * Property-based tests for view mode behavior consistency
 * **Feature: file-view-modes, Property 16: View Mode Behavior Consistency**
 * **Validates: Requirements 7.4, 7.5**
 */
describe('View Mode Behavior Consistency Properties', () => {
	let registry: ViewModeRegistry

	beforeEach(() => {
		registry = new ViewModeRegistry()
		registry.initialize()
	})

	/**
	 * Property 16: View Mode Behavior Consistency
	 * For any view mode, it should follow consistent patterns for tab creation, state management, and UI rendering
	 * **Validates: Requirements 7.4, 7.5**
	 */
	it('property: view mode detection is consistent across all file types', () => {
		fc.assert(
			fc.property(
				fc.record({
					filePath: fc.constantFrom(
						'test.txt',
						'test.md', 
						'.system/settings.json',
						'.system/userSettings.json',
						'binary.exe',
						'document.pdf'
					),
				}),
				(config) => {
					// Test that view mode detection is consistent
					const availableModes = detectAvailableViewModes(config.filePath)
					const defaultMode = getDefaultViewMode(config.filePath)

					// All files should have at least editor mode
					expect(availableModes).toContain('editor')
					
					// Default mode should be one of the available modes
					expect(availableModes).toContain(defaultMode)
					
					// Default mode should be 'editor' (as per requirements)
					expect(defaultMode).toBe('editor')
					
					// Each available mode should be valid for this file
					for (const mode of availableModes) {
						expect(isViewModeValid(mode, config.filePath)).toBe(true)
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: view mode validation is consistent', () => {
		fc.assert(
			fc.property(
				fc.record({
					filePath: fc.constantFrom(
						'test.txt',
						'.system/settings.json',
						'binary.exe'
					),
					requestedMode: fc.constantFrom('editor', 'ui', 'binary'),
				}),
				(config) => {
					const isValid = isViewModeValid(config.requestedMode, config.filePath)
					const validatedMode = getValidViewMode(config.requestedMode, config.filePath)
					const availableModes = detectAvailableViewModes(config.filePath)

					// Consistency checks
					if (isValid) {
						// If mode is valid, it should be in available modes
						expect(availableModes).toContain(config.requestedMode)
						// Validated mode should be the same as requested
						expect(validatedMode).toBe(config.requestedMode)
					} else {
						// If mode is invalid, validated mode should be different (fallback)
						expect(validatedMode).not.toBe(config.requestedMode)
						// Validated mode should always be valid
						expect(availableModes).toContain(validatedMode)
					}

					// Validated mode should always be available
					expect(availableModes).toContain(validatedMode)
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: view mode labels are consistent', () => {
		fc.assert(
			fc.property(
				fc.constantFrom('editor', 'ui', 'binary'),
				(viewMode) => {
					const label = getViewModeLabel(viewMode)
					
					// Label should be a non-empty string
					expect(typeof label).toBe('string')
					expect(label.length).toBeGreaterThan(0)
					
					// Label should be consistent across calls
					const label2 = getViewModeLabel(viewMode)
					expect(label).toBe(label2)
					
					// Built-in modes should have expected labels
					switch (viewMode) {
						case 'editor':
							expect(label).toBe('Editor')
							break
						case 'ui':
							expect(label).toBe('UI')
							break
						case 'binary':
							expect(label).toBe('Binary')
							break
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: settings files have consistent behavior', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(
					'.system/settings.json',
					'.system/userSettings.json'
				),
				(settingsFile) => {
					const availableModes = detectAvailableViewModes(settingsFile)
					const defaultMode = getDefaultViewMode(settingsFile)
					
					// Settings files should have both editor and ui modes
					expect(availableModes).toContain('editor')
					expect(availableModes).toContain('ui')
					expect(availableModes.length).toBe(2)
					
					// Default should still be editor (per requirements)
					expect(defaultMode).toBe('editor')
					
					// Both modes should be valid
					expect(isViewModeValid('editor', settingsFile)).toBe(true)
					expect(isViewModeValid('ui', settingsFile)).toBe(true)
					expect(isViewModeValid('binary', settingsFile)).toBe(false)
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: regular files only have editor mode', () => {
		fc.assert(
			fc.property(
				fc.constantFrom(
					'document.txt',
					'script.js',
					'style.css',
					'readme.md',
					'config.yaml'
				),
				(regularFile) => {
					const availableModes = detectAvailableViewModes(regularFile)
					const defaultMode = getDefaultViewMode(regularFile)
					
					// Regular files should only have editor mode
					expect(availableModes).toEqual(['editor'])
					expect(defaultMode).toBe('editor')
					
					// Only editor mode should be valid
					expect(isViewModeValid('editor', regularFile)).toBe(true)
					expect(isViewModeValid('ui', regularFile)).toBe(false)
					expect(isViewModeValid('binary', regularFile)).toBe(false)
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: registry extensibility maintains consistency', () => {
		fc.assert(
			fc.property(
				fc.record({
					customModeId: fc.constantFrom('preview', 'diagram', 'chart'),
					fileExtension: fc.constantFrom('.md', '.mermaid', '.csv'),
					label: fc.string({ minLength: 1, maxLength: 15 }),
				}),
				(config) => {
					// Register a custom mode
					registry.register({
						id: config.customModeId,
						label: config.label,
						isAvailable: (path) => path.endsWith(config.fileExtension),
					})

					const testFile = `test${config.fileExtension}`
					const nonMatchingFile = 'test.other'

					// Test consistency after registration
					const availableForMatching = registry.getAvailableModes(testFile)
					const availableForNonMatching = registry.getAvailableModes(nonMatchingFile)

					// Custom mode should be available for matching files
					const hasCustomMode = availableForMatching.some(
						mode => mode.id === config.customModeId
					)
					expect(hasCustomMode).toBe(true)

					// Custom mode should not be available for non-matching files
					const hasCustomModeForNonMatching = availableForNonMatching.some(
						mode => mode.id === config.customModeId
					)
					expect(hasCustomModeForNonMatching).toBe(false)

					// All files should still have editor mode
					expect(availableForMatching.some(mode => mode.id === 'editor')).toBe(true)
					expect(availableForNonMatching.some(mode => mode.id === 'editor')).toBe(true)
				}
			),
			{ numRuns: 100 }
		)
	})
})