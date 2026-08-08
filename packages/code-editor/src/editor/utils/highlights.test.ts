import { describe, expect, it } from 'vitest'
import { getHighlightClassForScope } from './highlights'

describe('getHighlightClassForScope', () => {
	it('maps a known exact scope', () => {
		expect(getHighlightClassForScope('comment')).toBe('syntax-comment')
	})

	it('falls back to a prefix match', () => {
		expect(getHighlightClassForScope('string.special.path')).toBe('syntax-string')
	})

	it('returns undefined for an unknown scope', () => {
		expect(getHighlightClassForScope('totally.unknown.scope')).toBeUndefined()
	})

	// The JS/TS highlight queries emit `constructor` for every capitalised
	// identifier. A plain index into the lookup table resolved that through
	// Object.prototype and returned the Object function, which is not
	// structured-cloneable — postMessage then rejected the whole decoration
	// snapshot and no file with a capitalised identifier ever highlighted.
	it.each([
		'constructor',
		'toString',
		'valueOf',
		'hasOwnProperty',
		'isPrototypeOf',
		'__proto__',
	])('never returns a non-string for prototype key %s', (scope) => {
		const result = getHighlightClassForScope(scope)
		expect(result === undefined || typeof result === 'string').toBe(true)
	})

	it('resolves prototype-shadowed prefixes safely too', () => {
		const result = getHighlightClassForScope('toString.something')
		expect(result === undefined || typeof result === 'string').toBe(true)
	})
})
