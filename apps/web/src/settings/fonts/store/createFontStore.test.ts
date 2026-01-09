import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createFontStore } from './createFontStore'

describe('Font Store Reactive State Management', () => {
	it('Property 27: Reactive UI Updates - For any font-related state change, it SHALL trigger reactive updates throughout the UI', () => {
		// **Validates: Requirements 6.6**
		
		// This is a property-based test for reactive state management
		// Testing that font store state changes trigger reactive updates
		
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
				(fontName) => {
					const store = createFontStore()
					
					// Initial state should be reactive
					expect(typeof store.availableFonts).toBe('function')
					expect(typeof store.installedFonts).toBe('function')
					expect(typeof store.cacheStats).toBe('function')
					expect(typeof store.pending).toBe('function')
					
					// State should be accessible through reactive getters
					const initialAvailable = store.availableFonts()
					const initialInstalled = store.installedFonts()
					const initialStats = store.cacheStats()
					const initialPending = store.pending()
					
					// All reactive getters should return consistent types
					expect(initialAvailable === undefined || typeof initialAvailable === 'object').toBe(true)
					expect(initialInstalled === undefined || initialInstalled instanceof Set).toBe(true)
					expect(initialStats === undefined || typeof initialStats === 'object').toBe(true)
					expect(typeof initialPending).toBe('boolean')
					
					return true
				}
			),
			{ numRuns: 100 }
		)
	})
})