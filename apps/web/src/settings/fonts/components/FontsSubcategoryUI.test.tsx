import { describe, it, expect } from 'vitest'

describe('FontsSubcategoryUI Integration', () => {
	it('should export FontsSubcategoryUI as a component function', async () => {
		const mod = await import('./FontsSubcategoryUI')
		expect(typeof mod.FontsSubcategoryUI).toBe('function')
	})
})
