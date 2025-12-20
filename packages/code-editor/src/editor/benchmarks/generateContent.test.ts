import { describe, expect, it } from 'vitest'
import { generateContent } from './generateContent'

describe('generateContent', () => {
	it('throws when charsPerLine is too small for line numbers', () => {
		expect(() =>
			generateContent({
				lines: 120,
				charsPerLine: 4,
				includeLineNumbers: true,
			})
		).toThrowError(/charsPerLine/i)
	})

	it('throws when charsPerLine is less than 1', () => {
		expect(() =>
			generateContent({
				lines: 10,
				charsPerLine: 0,
				includeLineNumbers: false,
			})
		).toThrowError(/charsPerLine/i)
	})
})
