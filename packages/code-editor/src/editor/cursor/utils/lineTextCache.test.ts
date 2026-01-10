import { describe, expect, it } from 'vitest'
import { countLineBreaks, updateLineTextCache } from './lineTextCache'

const buildCache = (entries: Array<[number, string]>) => new Map(entries)
const cacheEntries = (cache: Map<number, string>) => Array.from(cache.entries())

describe('lineTextCache', () => {
	it('counts line breaks', () => {
		expect(countLineBreaks('')).toBe(0)
		expect(countLineBreaks('no breaks')).toBe(0)
		expect(countLineBreaks('a\nb')).toBe(1)
		expect(countLineBreaks('a\nb\nc\n')).toBe(3)
	})

	it('drops a single line entry', () => {
		const cache = buildCache([
			[0, 'a'],
			[1, 'b'],
			[2, 'c'],
		])

		updateLineTextCache(cache, {
			startLine: 1,
			endLine: 1,
			lineDelta: 0,
		})

		expect(cacheEntries(cache)).toEqual([
			[0, 'a'],
			[2, 'c'],
		])
	})

	it('shifts cached lines after line insert', () => {
		const cache = buildCache([
			[0, 'a'],
			[1, 'b'],
			[2, 'c'],
			[3, 'd'],
		])

		updateLineTextCache(cache, {
			startLine: 1,
			endLine: 1,
			lineDelta: 2,
		})

		expect(cacheEntries(cache)).toEqual([
			[0, 'a'],
			[4, 'c'],
			[5, 'd'],
		])
	})

	it('shifts cached lines after line deletion', () => {
		const cache = buildCache([
			[0, 'a'],
			[1, 'b'],
			[2, 'c'],
			[3, 'd'],
			[4, 'e'],
		])

		updateLineTextCache(cache, {
			startLine: 1,
			endLine: 3,
			lineDelta: -2,
		})

		expect(cacheEntries(cache)).toEqual([
			[0, 'a'],
			[2, 'e'],
		])
	})

	it('drops a multi-line range without shifting', () => {
		const cache = buildCache([
			[0, 'a'],
			[1, 'b'],
			[2, 'c'],
			[3, 'd'],
		])

		updateLineTextCache(cache, {
			startLine: 1,
			endLine: 2,
			lineDelta: 0,
		})

		expect(cacheEntries(cache)).toEqual([
			[0, 'a'],
			[3, 'd'],
		])
	})
})
