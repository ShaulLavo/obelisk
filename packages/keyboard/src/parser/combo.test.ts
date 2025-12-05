import { describe, expect, it } from 'bun:test'
import { equalCombos, normalizeCombo } from './combo'
import type { KeyCombo, Modifier } from './types'

describe('normalizeCombo', () => {
	it('fills defaults and clones modifiers', () => {
	const original = {
		key: undefined as unknown as KeyCombo['key'],
		modifiers: new Set<Modifier>(['ctrl'])
	} as KeyCombo
		const normalized = normalizeCombo(original)
		expect(normalized.key).toBe('')
		expect(normalized.modifiers).not.toBe(original.modifiers)
		expect(Array.from(normalized.modifiers)).toEqual(['ctrl'])
	})
})

describe('equalCombos', () => {
	it('compares both key and modifiers', () => {
		const a = normalizeCombo({
			key: 'k',
			modifiers: new Set<Modifier>(['ctrl', 'shift'])
		})
		const b = normalizeCombo({
			key: 'k',
			modifiers: new Set<Modifier>(['shift', 'ctrl'])
		})
		const c = normalizeCombo({
			key: 'k',
			modifiers: new Set<Modifier>(['ctrl'])
		})
		expect(equalCombos(a, b)).toBe(true)
		expect(equalCombos(a, c)).toBe(false)
	})
})
