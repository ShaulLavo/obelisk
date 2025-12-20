import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-solid'
import { createSignal } from 'solid-js'
import { createFoldMapping } from './createFoldMapping'
import type { FoldRange } from '../types'

// ============================================================================
// Browser Tests - Solid.js reactivity requires browser environment
// ============================================================================

describe('createFoldMapping (browser)', () => {
	describe('reactivity', () => {
		it('updates when foldedStarts changes', async () => {
			const { result: mapping } = renderHook(() => {
				const folds: FoldRange[] = [
					{ startLine: 2, endLine: 5, type: 'function' },
				]
				const [foldedStarts, setFoldedStarts] = createSignal<Set<number>>(
					new Set<number>()
				)

				const mapping = createFoldMapping({
					totalLines: () => 10,
					folds: () => folds,
					foldedStarts,
				})

				return { mapping, setFoldedStarts }
			})

			await expect.poll(() => mapping.current.mapping.visibleCount()).toBe(10)

			mapping.current.setFoldedStarts(new Set([2]))

			await expect.poll(() => mapping.current.mapping.visibleCount()).toBe(8)

			mapping.current.setFoldedStarts(new Set<number>())

			await expect.poll(() => mapping.current.mapping.visibleCount()).toBe(10)
		})
	})
})
