import { createEffect, createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import type { TreeSitterCapture } from '../../workers/treeSitter/types'
import type { HighlightTransform } from './createHighlightState'
import { createHighlightState } from './createHighlightState'

describe('createHighlightState', () => {
	it('clears offsets and updates highlights in one effect', async () => {
		await new Promise<void>((resolve) => {
			createRoot((dispose) => {
				const {
					fileHighlights,
					highlightOffsets,
					applyHighlightOffset,
					setHighlights,
				} = createHighlightState()
				const path = 'file.ts'
				const runs: Array<{
					highlights: TreeSitterCapture[] | undefined
					offsets: HighlightTransform[] | undefined
				}> = []

				createEffect(() => {
					runs.push({
						highlights: fileHighlights[path],
						offsets: highlightOffsets[path],
					})
				})

				applyHighlightOffset(path, {
					charDelta: 1,
					lineDelta: 0,
					fromCharIndex: 0,
					fromLineRow: 0,
					oldEndRow: 0,
					newEndRow: 0,
					oldEndIndex: 0,
					newEndIndex: 1,
				})

				const before = runs.length

				setHighlights(path, [
					{
						startIndex: 0,
						endIndex: 1,
						scope: 'keyword',
					},
				])

				// Effects are batched - need to wait for microtask to flush
				queueMicrotask(() => {
					expect(runs.length - before).toBe(1)
					const last = runs[runs.length - 1]
					expect(last?.offsets).toBeUndefined()
					expect(last?.highlights?.length).toBe(1)

					dispose()
					resolve()
				})
			})
		})
	})

	it('skips updates when highlights are empty and offsets are clear', () => {
		createRoot((dispose) => {
			const { fileHighlights, highlightOffsets, setHighlights } =
				createHighlightState()
			const path = 'file.ts'
			const runs: Array<{
				highlights: TreeSitterCapture[] | undefined
				offsets: HighlightTransform[] | undefined
			}> = []

			createEffect(() => {
				runs.push({
					highlights: fileHighlights[path],
					offsets: highlightOffsets[path],
				})
			})

			const before = runs.length

			setHighlights(path, [])

			expect(runs.length).toBe(before)

			dispose()
		})
	})
})
