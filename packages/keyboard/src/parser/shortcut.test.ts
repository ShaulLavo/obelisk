import { describe, expect, it } from 'bun:test'
import { parseShortcut, parseShortcutSequence } from './shortcut'

describe('parseShortcut', () => {
	it('parses modifier+key combos', () => {
		const combo = parseShortcut('ctrl+shift+k')
		expect(combo.key).toBe('k')
		expect(combo.modifiers).toEqual(new Set(['ctrl', 'shift']))
	})

	it('keeps = distinct from + by default', () => {
		const equalCombo = parseShortcut('ctrl+=')
		expect(equalCombo.key).toBe('=')
		const plusCombo = parseShortcut('ctrl++')
		expect(plusCombo.key).toBe('+')
	})

	it('supports primary modifier alias per platform', () => {
		const macCombo = parseShortcut('primary+k', { platform: 'mac' })
		expect(macCombo.modifiers).toEqual(new Set(['meta']))

		const winCombo = parseShortcut('primary+k', { platform: 'windows' })
		expect(winCombo.modifiers).toEqual(new Set(['ctrl']))
	})
})

describe('parseShortcutSequence', () => {
	it('supports JSON array based sequences with literal semicolons', () => {
		const sequence = parseShortcutSequence('["ctrl+k",";"]')
		expect(sequence).toHaveLength(2)
		expect(sequence[1]!.key).toBe(';')
	})

	it('throws on invalid sequence syntax', () => {
		expect(() => parseShortcutSequence('not json')).toThrow()
	})
})
