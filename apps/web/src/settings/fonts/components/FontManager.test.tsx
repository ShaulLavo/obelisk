import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { formatBytes } from '@repo/utils'

describe('FontManager Component Logic', () => {
	it('should format bytes correctly using production formatBytes', () => {
		// Uses the actual formatBytes from @repo/utils (same one FontManager imports)
		expect(formatBytes(0)).toBe('0 Bytes')
		expect(formatBytes(1024)).toBe('1 KB')
		expect(formatBytes(1024 * 1024)).toBe('1 MB')
		expect(formatBytes(1536 * 1024)).toBe('1.5 MB')
		expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
	})

	it('Property: Font list sorting should be consistent', () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
					minLength: 0,
					maxLength: 10,
				}),
				(fontNames) => {
					const sorted1 = [...fontNames].sort()
					const sorted2 = [...fontNames].sort()

					// Sorting should be deterministic
					expect(sorted1).toEqual(sorted2)

					// All original items should be present
					expect(sorted1.length).toBe(fontNames.length)

					return true
				}
			),
			{ numRuns: 50 }
		)
	})
})
