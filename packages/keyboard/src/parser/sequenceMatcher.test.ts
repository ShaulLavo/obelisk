import { describe, expect, it } from 'bun:test'
import { createShortcutSequenceMatcher } from './sequenceMatcher'
import type { ShortcutSequence } from './types'

const baseEvent: KeyboardEvent = {
	key: '',
	code: '',
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	metaKey: false,
	repeat: false
} as KeyboardEvent

function eventFor(key: string, overrides: Partial<KeyboardEvent> = {}) {
	return { ...baseEvent, key, code: key, ...overrides } as KeyboardEvent
}

describe('createShortcutSequenceMatcher', () => {
	it('rejects empty sequences', () => {
		expect(() => createShortcutSequenceMatcher('[]')).toThrow(/at least one/i)
		expect(() =>
			createShortcutSequenceMatcher([] as ShortcutSequence)
		).toThrow(/at least one combo/i)
	})

	it('matches a sequence of shortcuts', () => {
		const matcher = createShortcutSequenceMatcher('["k","m"]')
		expect(matcher.handleEvent(eventFor('k'))).toBe(false)
		expect(matcher.handleEvent(eventFor('m'))).toBe(true)
	})

	it('resets when sequence breaks', () => {
		const matcher = createShortcutSequenceMatcher('["k","m"]')
		matcher.handleEvent(eventFor('k'))
		matcher.handleEvent(eventFor('x'))
		expect(matcher.handleEvent(eventFor('m'))).toBe(false)
	})

	it('resets when timeout elapses between events', () => {
		const matcher = createShortcutSequenceMatcher('["k","m"]', { timeoutMs: 100 })
		const originalNow = Date.now
		let now = 0
		Date.now = () => now
		try {
			matcher.handleEvent(eventFor('k'))
			now = 200
			expect(matcher.handleEvent(eventFor('m'))).toBe(false)
		} finally {
			Date.now = originalNow
		}
	})

	it('supports subsequence matching when enabled', () => {
		const matcher = createShortcutSequenceMatcher('["g","i"]', {
			allowSubsequence: true,
			timeoutMs: 1000
		})
		expect(matcher.handleEvent(eventFor('g'))).toBe(false)
		expect(matcher.handleEvent(eventFor('x'))).toBe(false)
		expect(matcher.handleEvent(eventFor('i'))).toBe(true)
	})

	it('still enforces timeouts for subsequences', () => {
		const matcher = createShortcutSequenceMatcher('["g","i"]', {
			allowSubsequence: true,
			timeoutMs: 100
		})
		const originalNow = Date.now
		let now = 0
		Date.now = () => now
		try {
			expect(matcher.handleEvent(eventFor('g'))).toBe(false)
			now = 150
			expect(matcher.handleEvent(eventFor('x'))).toBe(false)
			now = 200
			expect(matcher.handleEvent(eventFor('i'))).toBe(false)
		} finally {
			Date.now = originalNow
		}
	})
})
