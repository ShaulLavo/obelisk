import { describe, expect, it } from 'bun:test'
import { fromEvent } from './events'

function createEvent(
	key: string,
	overrides: Partial<KeyboardEvent> = {}
): KeyboardEvent {
	return {
		key,
		code: key,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		repeat: false,
		...overrides
	} as KeyboardEvent
}

describe('fromEvent', () => {
	it('captures modifier state and maps keys', () => {
		const combo = fromEvent(
			createEvent('k', { ctrlKey: true, shiftKey: true, key: 'K' })
		)
		expect(combo.key).toBe('k')
		expect(combo.modifiers).toEqual(new Set(['ctrl', 'shift']))
	})

	it('respects treatEqualAsDistinct flag', () => {
		const collapsed = fromEvent(createEvent('='), {
			treatEqualAsDistinct: false
		})
		expect(collapsed.key).toBe('+')
	})
})
