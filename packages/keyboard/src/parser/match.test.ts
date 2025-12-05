import { describe, expect, it } from 'bun:test'
import { matchShortcut } from './match'

const baseEvent: KeyboardEvent = {
	key: '',
	code: '',
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	metaKey: false,
	repeat: false
} as KeyboardEvent

function withEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
	return { ...baseEvent, ...overrides } as KeyboardEvent
}

describe('matchShortcut', () => {
	it('matches expected combos', () => {
		const event = withEvent({ key: 'k', ctrlKey: true })
		expect(matchShortcut('ctrl+k', event)).toBe(true)
	})

	it('obeys ignoreRepeat flag', () => {
		const repeatEvent = withEvent({ key: 'k', repeat: true })
		expect(matchShortcut('k', repeatEvent)).toBe(false)
		expect(matchShortcut('k', repeatEvent, { ignoreRepeat: false })).toBe(true)
	})

	it('respects treatEqualAsDistinct option', () => {
		const equalEvent = withEvent({ key: '=' })
		expect(
			matchShortcut('=', equalEvent, { treatEqualAsDistinct: false })
		).toBe(true)
	})
})
