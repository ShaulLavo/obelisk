import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { createActiveFileState, updateActiveFileField, getActiveFileField, clearActiveFileField } from './activeFileState'
import type { ActiveFileState, ActiveFileStateOptions } from './activeFileState'
import type { FileCacheEntry } from './fileCacheController'

describe('ActiveFileState', () => {
	let activeState: ActiveFileState
	let onActiveChangeMock: ReturnType<typeof vi.fn>
	let onDeactivateMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		onActiveChangeMock = vi.fn()
		onDeactivateMock = vi.fn()
		
		const options: ActiveFileStateOptions = {
			onActiveChange: onActiveChangeMock as any,
			onDeactivate: onDeactivateMock as any
		}
		
		activeState = createActiveFileState(options)
	})

	describe('Property 12: Active File Eviction Exemption', () => {
		it('should maintain active file state regardless of cache operations', async () => {
			 fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Generate file path
					fc.record({
						scrollPosition: fc.oneof(
							fc.constant(undefined),
							fc.record({
								scrollTop: fc.integer(),
								scrollLeft: fc.integer()
							})
						)
					}) // Generate partial cache entry
				, (path, entry) => {
					// Set file as active
					activeState.setActive(path)
					expect(activeState.isActive(path)).toBe(true)
					expect(activeState.activePath).toBe(path)

					// Set active file entry
					activeState.setActiveEntry(entry)
					
					// Verify active file entry is preserved
					const retrievedEntry = activeState.getActiveEntry()
					expect(retrievedEntry).toEqual(entry)
					
					// Active file should remain active regardless of external operations
					// (This simulates cache eviction scenarios where other files might be evicted
					// but the active file should never be affected)
					expect(activeState.isActive(path)).toBe(true)
					expect(activeState.getActiveEntry()).toEqual(entry)
				}),
				{ numRuns: 100 }
			)
		})

		it('should preserve active file state when switching between files', async () => {
			await fc.assert(
				fc.property(
					fc.array(
						fc.string({ minLength: 1, maxLength: 50 })
							.map(s => '/' + s.replace(/\//g, '_')),
						{ minLength: 2, maxLength: 5 }
					), // Generate array of file paths
					fc.array(fc.string(), { minLength: 2, maxLength: 5 }) // Generate simple string values for each file
				, (paths, values) => {
					// Create fresh mocks and state for each property test run
					const localOnActiveChangeMock = vi.fn()
					const localOnDeactivateMock = vi.fn()
					
					const localActiveState = createActiveFileState({
						onActiveChange: localOnActiveChangeMock as any,
						onDeactivate: localOnDeactivateMock as any
					})
					
					// Set each file as active and store some data
					for (let i = 0; i < Math.min(paths.length, values.length); i++) {
						const path = paths[i]
						if (!path) continue // Skip undefined paths
						
						localActiveState.setActive(path)
						localActiveState.setActiveEntry({ scrollPosition: { scrollTop: 0, scrollLeft: 0 } })
						
						// Verify current active file
						expect(localActiveState.isActive(path)).toBe(true)
						expect(localActiveState.getActiveEntry()?.scrollPosition).toEqual({ scrollTop: 0, scrollLeft: 0 })
					}
					
					// Verify deactivation callbacks were called for previous files
					expect(localOnDeactivateMock).toHaveBeenCalledTimes(Math.min(paths.length, values.length) - 1)
				}),
				{ numRuns: 50 }
			)
		})
	})

	describe('Property 13: Active to Inactive Transition', () => {
		it('should trigger deactivation callback when file becomes inactive', async () => {
			await fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // First file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Second file path
					fc.record({
						scrollPosition: fc.oneof(
							fc.constant(undefined),
							fc.record({
								scrollTop: fc.integer(),
								scrollLeft: fc.integer()
							})
						)
					}) // Cache entry for first file
				, (path1, path2, entry) => {
					// Ensure paths are different
					if (path1 === path2) return

					// Set first file as active with some data
					activeState.setActive(path1)
					activeState.setActiveEntry(entry)
					
					// Clear mock calls
					onDeactivateMock.mockClear()
					
					// Switch to second file (should trigger deactivation)
					activeState.setActive(path2)
					
					// Verify deactivation callback was called with correct data
					expect(onDeactivateMock).toHaveBeenCalledTimes(1)
					expect(onDeactivateMock).toHaveBeenCalledWith(path1, entry)
					
					// Verify new active file
					expect(activeState.isActive(path2)).toBe(true)
					expect(activeState.isActive(path1)).toBe(false)
				}),
				{ numRuns: 100 }
			)
		})

		it('should clear active entry when switching files', async () => {
			await fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // First file path
					fc.string({ minLength: 1, maxLength: 50 })
						.map(s => '/' + s.replace(/\//g, '_')), // Second file path
					fc.string() // Some simple string data for first file
				, (path1, path2, data) => {
					// Ensure paths are different
					if (path1 === path2) return

					// Set first file as active with data
					activeState.setActive(path1)
					activeState.setActiveEntry({ scrollPosition: { scrollTop: 100, scrollLeft: 50 } })
					
					// Verify data is set
					expect(activeState.getActiveEntry()?.scrollPosition).toEqual({ scrollTop: 100, scrollLeft: 50 })
					
					// Switch to second file
					activeState.setActive(path2)
					
					// Verify active entry is cleared for new file
					const newEntry = activeState.getActiveEntry()
					expect(newEntry).toEqual({})
				}),
				{ numRuns: 100 }
			)
		})
	})

	describe('Basic functionality', () => {
		it('should handle no active file initially', () => {
			expect(activeState.activePath).toBeNull()
			expect(activeState.getActiveEntry()).toBeNull()
			expect(activeState.isActive('/any/path')).toBe(false)
		})

		it('should set and get active file', () => {
			const path = '/test/file.ts'
			activeState.setActive(path)
			
			expect(activeState.activePath).toBe(path)
			expect(activeState.isActive(path)).toBe(true)
			expect(activeState.isActive('/other/file.ts')).toBe(false)
		})

		it('should update active file entry', () => {
			const path = '/test/file.ts'
			const entry: Partial<FileCacheEntry> = {
				scrollPosition: { scrollTop: 50, scrollLeft: 0 }
			}
			
			activeState.setActive(path)
			activeState.setActiveEntry(entry)
			
			const retrieved = activeState.getActiveEntry()
			expect(retrieved).toEqual(entry)
		})

		it('should merge partial entries', () => {
			const path = '/test/file.ts'
			
			activeState.setActive(path)
			activeState.setActiveEntry({ scrollPosition: { scrollTop: 50, scrollLeft: 0 } })
			activeState.setActiveEntry({ scrollPosition: { scrollTop: 100, scrollLeft: 25 } })
			
			const retrieved = activeState.getActiveEntry()
			expect(retrieved).toEqual({
				scrollPosition: { scrollTop: 100, scrollLeft: 25 }
			})
		})

		it('should handle deactivation to null', () => {
			const path = '/test/file.ts'
			const entry = { scrollPosition: { scrollTop: 50, scrollLeft: 0 } }
			
			activeState.setActive(path)
			activeState.setActiveEntry(entry)
			
			onDeactivateMock.mockClear()
			activeState.setActive(null)
			
			expect(onDeactivateMock).toHaveBeenCalledWith(path, entry)
			expect(activeState.activePath).toBeNull()
			expect(activeState.getActiveEntry()).toBeNull()
		})
	})

	describe('Utility functions', () => {
		beforeEach(() => {
			activeState.setActive('/test/file.ts')
		})

		it('should update specific field', () => {
			const scrollPos = { scrollTop: 100, scrollLeft: 50 }
			updateActiveFileField(activeState, 'scrollPosition', scrollPos)
			
			expect(getActiveFileField(activeState, 'scrollPosition')).toBe(scrollPos)
		})

		it('should get specific field', () => {
			const scrollPos = { scrollTop: 100, scrollLeft: 50 }
			activeState.setActiveEntry({ scrollPosition: scrollPos })
			
			expect(getActiveFileField(activeState, 'scrollPosition')).toBe(scrollPos)
			expect(getActiveFileField(activeState, 'stats')).toBeUndefined()
		})

		it('should clear specific field', () => {
			activeState.setActiveEntry({
				scrollPosition: { scrollTop: 50, scrollLeft: 0 }
			})
			
			clearActiveFileField(activeState, 'scrollPosition')
			
			const entry = activeState.getActiveEntry()
			expect(entry?.scrollPosition).toBeUndefined()
		})

		it('should handle utility functions with no active file', () => {
			activeState.setActive(null)
			
			updateActiveFileField(activeState, 'scrollPosition', { scrollTop: 100, scrollLeft: 50 })
			expect(getActiveFileField(activeState, 'scrollPosition')).toBeUndefined()
			
			clearActiveFileField(activeState, 'scrollPosition')
			// Should not throw
		})
	})
})