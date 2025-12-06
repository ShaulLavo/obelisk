import { describe, expect, it } from 'bun:test'
import { resolvePlatformShortcut } from './platformMapping'
import type { KeyCombo } from './types'

describe('resolvePlatformShortcut', () => {
	it('maps primary modifier to platform specific label', () => {
		expect(resolvePlatformShortcut('primary+k', 'windows')).toBe('Ctrl+K')
		expect(resolvePlatformShortcut('primary+k', 'mac')).toBe('Meta+K')
	})

	it('supports KeyCombo inputs', () => {
		const combo: KeyCombo = {
			key: 'k',
			modifiers: new Set(['shift', 'meta'])
		}

		expect(resolvePlatformShortcut(combo, 'mac')).toBe('Shift+Meta+K')
	})
})
