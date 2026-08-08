import { describe, it, expect } from 'vitest'
import {
	cacheKeyEquals,
	detectRenderMode,
	buildCacheKey,
	type RowCacheKey,
	type LineRenderInput,
} from './lineHtml'

const makeInput = (overrides?: Partial<LineRenderInput>): LineRenderInput => ({
	lineId: 1,
	lineRevision: 1,
	decorationRevision: 0,
	themeVersion: 0,
	text: 'hello world',
	highlights: null,
	bracketDepths: null,
	...overrides,
})

describe('lineHtml', () => {
	describe('cacheKeyEquals', () => {
		it('returns true for identical keys', () => {
			const key: RowCacheKey = { lineId: 1, lineRevision: 1, decorationRevision: 0, themeVersion: 0, renderMode: 'plain' }
			expect(cacheKeyEquals(key, { ...key })).toBe(true)
		})

		it('returns false when lineRevision differs', () => {
			const a: RowCacheKey = { lineId: 1, lineRevision: 1, decorationRevision: 0, themeVersion: 0, renderMode: 'plain' }
			const b: RowCacheKey = { ...a, lineRevision: 2 }
			expect(cacheKeyEquals(a, b)).toBe(false)
		})

		it('returns false when renderMode differs', () => {
			const a: RowCacheKey = { lineId: 1, lineRevision: 1, decorationRevision: 0, themeVersion: 0, renderMode: 'plain' }
			const b: RowCacheKey = { ...a, renderMode: 'decorated' }
			expect(cacheKeyEquals(a, b)).toBe(false)
		})
	})

	describe('detectRenderMode', () => {
		it('returns plain when no decorations', () => {
			expect(detectRenderMode(makeInput())).toBe('plain')
		})

		it('returns decorated when highlights exist', () => {
			expect(
				detectRenderMode(
					makeInput({
						highlights: [{ start: 0, end: 5, className: 'keyword', scope: 'keyword' }],
					})
				)
			).toBe('decorated')
		})

		it('returns decorated when bracket depths exist', () => {
			expect(
				detectRenderMode(
					makeInput({ bracketDepths: { 0: 1 } })
				)
			).toBe('decorated')
		})

		it('returns plain for empty highlight array', () => {
			expect(detectRenderMode(makeInput({ highlights: [] }))).toBe('plain')
		})
	})

	describe('buildCacheKey', () => {
		it('builds correct key for plain text', () => {
			const key = buildCacheKey(makeInput())
			expect(key).toEqual({
				lineId: 1,
				lineRevision: 1,
				decorationRevision: 0,
				themeVersion: 0,
				renderMode: 'plain',
			})
		})

		it('builds correct key for decorated text', () => {
			const key = buildCacheKey(
				makeInput({
					highlights: [{ start: 0, end: 3, className: 'kw', scope: 'keyword' }],
				})
			)
			expect(key.renderMode).toBe('decorated')
		})
	})
})
