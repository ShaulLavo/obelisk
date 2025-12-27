import { describe, expect, it } from 'vitest'
import { shouldResetWidthScan } from './createTextEditorLayout'

describe('shouldResetWidthScan', () => {
	it('resets when tab size changes', () => {
		expect(shouldResetWidthScan(4, 10, 2, 10)).toBe(true)
	})

	it('resets when line count changes', () => {
		expect(shouldResetWidthScan(2, 11, 2, 10)).toBe(true)
	})

	it('does not reset when tab size and line count are unchanged', () => {
		expect(shouldResetWidthScan(2, 10, 2, 10)).toBe(false)
	})
})
