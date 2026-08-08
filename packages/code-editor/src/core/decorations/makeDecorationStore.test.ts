import { describe, it, expect } from 'vitest'
import { makeDecorationStore, type DecorationStoreSnapshot } from './makeDecorationStore'
import type { DocumentIdentity } from '../types'

const identity: DocumentIdentity = {
	sessionId: 'sess1',
	documentKey: 'test.ts',
	documentIncarnation: 1,
}

const lineStarts = [0, 6, 12] // "hello\nworld\nfoo"
const lineIds = [1, 2, 3]

const makeSnapshot = (overrides?: Partial<DecorationStoreSnapshot>): DecorationStoreSnapshot => ({
	identity,
	docVersion: 1,
	highlights: [
		{ start: 0, end: 5, className: 'keyword', scope: 'keyword' },
		{ start: 6, end: 11, className: 'string', scope: 'string' },
	],
	errors: [],
	brackets: [],
	...overrides,
})

describe('makeDecorationStore', () => {
	describe('apply', () => {
		it('applies matching snapshot and returns affected line IDs', () => {
			const store = makeDecorationStore()
			const affected = store.apply(makeSnapshot(), identity, 1, lineStarts, lineIds)
			expect(affected).not.toBeNull()
			expect(affected!.length).toBeGreaterThan(0)
		})

		it('stores per-line highlight segments', () => {
			const store = makeDecorationStore()
			store.apply(makeSnapshot(), identity, 1, lineStarts, lineIds)

			const dec1 = store.getLineDecorations(1)
			expect(dec1).not.toBeNull()
			expect(dec1!.highlightSegments).not.toBeNull()
			expect(dec1!.highlightSegments![0]!.className).toBe('keyword')

			const dec2 = store.getLineDecorations(2)
			expect(dec2).not.toBeNull()
			expect(dec2!.highlightSegments![0]!.className).toBe('string')
		})

		it('returns null for line with no decorations', () => {
			const store = makeDecorationStore()
			store.apply(makeSnapshot(), identity, 1, lineStarts, lineIds)
			expect(store.getLineDecorations(3)).toBeNull() // "foo" has no highlights
		})
	})

	describe('stale snapshot discard', () => {
		it('discards snapshot with wrong docVersion', () => {
			const store = makeDecorationStore()
			const result = store.apply(
				makeSnapshot({ docVersion: 99 }),
				identity,
				1, // current version is 1
				lineStarts,
				lineIds
			)
			expect(result).toBeNull()
		})

		it('discards snapshot with wrong sessionId', () => {
			const store = makeDecorationStore()
			const result = store.apply(
				makeSnapshot({
					identity: { ...identity, sessionId: 'other' },
				}),
				identity,
				1,
				lineStarts,
				lineIds
			)
			expect(result).toBeNull()
		})

		it('discards snapshot with wrong documentKey', () => {
			const store = makeDecorationStore()
			const result = store.apply(
				makeSnapshot({
					identity: { ...identity, documentKey: 'other.ts' },
				}),
				identity,
				1,
				lineStarts,
				lineIds
			)
			expect(result).toBeNull()
		})

		it('discards snapshot with wrong incarnation', () => {
			const store = makeDecorationStore()
			const result = store.apply(
				makeSnapshot({
					identity: { ...identity, documentIncarnation: 99 },
				}),
				identity,
				1,
				lineStarts,
				lineIds
			)
			expect(result).toBeNull()
		})
	})

	describe('fallback decoration reuse', () => {
		it('promoteFallback preserves current decorations as fallback', () => {
			const store = makeDecorationStore()
			store.apply(makeSnapshot(), identity, 1, lineStarts, lineIds)

			store.promoteFallback()
			store.clear() // clear current

			// Current should be null
			expect(store.getLineDecorations(1)).toBeNull()
			// Fallback should have the old decorations
			expect(store.getFallback(1)).not.toBeNull()
			expect(store.getFallback(1)!.highlightSegments![0]!.className).toBe('keyword')
		})
	})

	describe('search state', () => {
		it('stores and retrieves search state', () => {
			const store = makeDecorationStore()
			store.setSearchState({
				query: 'hello',
				matches: [{ start: 0, end: 5 }],
				currentIndex: 0,
			})

			expect(store.getSearchState()?.query).toBe('hello')
		})

		it('returns search highlights for a line', () => {
			const store = makeDecorationStore()
			store.setSearchState({
				query: 'hello',
				matches: [{ start: 0, end: 5 }, { start: 6, end: 11 }],
				currentIndex: 0,
			})

			// Line 0 starts at 0, length 5
			const highlights = store.getSearchHighlights(1, 0, 5)
			expect(highlights).not.toBeNull()
			expect(highlights!.length).toBe(1)
			expect(highlights![0]!.className).toBe('editor-search-highlight')
		})

		it('returns null when no search matches on line', () => {
			const store = makeDecorationStore()
			store.setSearchState({
				query: 'hello',
				matches: [{ start: 0, end: 5 }],
				currentIndex: 0,
			})

			// Line 2 starts at 12, length 3 — no match
			const highlights = store.getSearchHighlights(3, 12, 3)
			expect(highlights).toBeNull()
		})

		it('clears search state', () => {
			const store = makeDecorationStore()
			store.setSearchState({ query: 'x', matches: [], currentIndex: 0 })
			store.setSearchState(null)
			expect(store.getSearchState()).toBeNull()
		})
	})

	describe('clear', () => {
		it('clears all decorations', () => {
			const store = makeDecorationStore()
			store.apply(makeSnapshot(), identity, 1, lineStarts, lineIds)
			store.clear()
			expect(store.getLineDecorations(1)).toBeNull()
			expect(store.getLineDecorations(2)).toBeNull()
		})
	})

	describe('decoration revision', () => {
		it('increments revision on apply', () => {
			const store = makeDecorationStore()
			store.apply(makeSnapshot(), identity, 1, lineStarts, lineIds)
			const rev1 = store.getLineDecorationRevision(1)
			expect(rev1).toBeGreaterThan(0)
		})

		it('returns 0 for lines without decorations', () => {
			const store = makeDecorationStore()
			expect(store.getLineDecorationRevision(999)).toBe(0)
		})
	})
})
