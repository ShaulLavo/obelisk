import { describe, expect, it } from 'bun:test'
import { contentKeyMapper, normalizeKey, parseKeyToken } from './keyUtils'

describe('contentKeyMapper', () => {
	it('maps letters to lowercase letter keys', () => {
		expect(contentKeyMapper('A')).toBe('a')
	})

	it('maps digits and symbols correctly', () => {
		expect(contentKeyMapper('5')).toBe('5')
		expect(contentKeyMapper(')')).toBe('0')
	})

	it('maps special keys', () => {
		expect(contentKeyMapper('Space')).toBe('space')
		expect(contentKeyMapper('Equal')).toBe('=')
	})

	it('supports collapsing = into + when configured', () => {
		expect(contentKeyMapper('=', { treatEqualAsDistinct: false })).toBe('+')
	})
})

describe('parseKeyToken', () => {
	it('trims input before mapping', () => {
		expect(parseKeyToken('  ; ')).toBe(';')
	})
})

describe('normalizeKey', () => {
	it('maps raw strings into normalized content keys', () => {
		expect(normalizeKey('ArrowLeft')).toBe('←')
		expect(normalizeKey('A')).toBe('a')
	})

	it('honors equal preference when collapsing +=', () => {
		expect(normalizeKey('=', { treatEqualAsDistinct: false })).toBe('+')
	})
})
