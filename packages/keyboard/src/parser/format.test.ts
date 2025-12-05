import { describe, expect, it } from 'bun:test'
import { formatKeyLabel, formatShortcut } from './format'
import type { KeyCombo, Modifier } from './types'

const combo: KeyCombo = {
	key: 'k',
	modifiers: new Set<Modifier>(['meta', 'shift', 'alt', 'ctrl'])
}

describe('formatShortcut modifier ordering', () => {
	it('uses mac ordering', () => {
		const result = formatShortcut(combo, { platform: 'mac', useSymbols: false })
		expect(result).toBe('Ctrl Alt Shift Cmd K')
	})

	it('uses windows/linux ordering', () => {
		const result = formatShortcut(combo, {
			platform: 'windows',
			useSymbols: false
		})
		expect(result).toBe('Ctrl Shift Alt Win K')
	})

	it('uses linux ordering', () => {
		const result = formatShortcut(combo, { platform: 'linux', useSymbols: false })
		expect(result).toBe('Ctrl Shift Alt Win K')
	})
})

describe('formatKeyLabel friendly names', () => {
	const cases: Array<[Parameters<typeof formatKeyLabel>[0], string]> = [
		['space', 'Space'],
		['tab', 'Tab'],
		['enter', 'Enter'],
		['esc', 'Esc'],
		['capsLock', 'Caps Lock'],
		['delete', 'Delete'],
		['a', 'A'],
		['↑', '↑'],
		[';', ';']
	]

	for (const [input, expected] of cases) {
		it(`converts ${input} to ${expected}`, () => {
			expect(formatKeyLabel(input)).toBe(expected)
		})
	}
})
