import { describe, expect, it } from 'bun:test'
import { parseModifiers, sortModifiers } from './modifierUtils'
import type { Modifier } from './types'

describe('parseModifiers', () => {
	it('parses aliases and mod keyword', () => {
		const result = parseModifiers('ctrl shift mod', 'mac')
		expect(result).toEqual(new Set(['ctrl', 'shift', 'meta']))
	})

	it('throws for unknown modifiers', () => {
		expect(() => parseModifiers('unknown', 'mac')).toThrow()
	})
})

describe('sortModifiers', () => {
	it('orders modifiers differently per platform', () => {
		const mods = new Set<Modifier>(['alt', 'ctrl', 'shift', 'meta'])
		expect(sortModifiers(mods, 'mac')).toEqual(['ctrl', 'alt', 'shift', 'meta'])
		expect(sortModifiers(mods, 'windows')).toEqual([
			'ctrl',
			'shift',
			'alt',
			'meta'
		])
	})
})
