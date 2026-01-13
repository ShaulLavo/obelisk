import { batch } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import type { TreeSitterCapture } from '../../workers/treeSitter/types'
import { createFilePath } from '@repo/fs'

export type HighlightTransform = {
	charDelta: number
	lineDelta: number
	fromCharIndex: number
	fromLineRow: number
	oldEndRow: number
	newEndRow: number
	oldEndIndex: number
	newEndIndex: number
}

export const createHighlightState = () => {
	const [fileHighlights, setHighlightsStore] = createStore<
		Record<string, TreeSitterCapture[] | undefined>
	>({})

	// Track pending offsets per file - avoid shifting all highlights per edit
	const [highlightOffsets, setHighlightOffsets] = createStore<
		Record<string, HighlightTransform[] | undefined>
	>({})

	let highlightUpdateId = 0

	const applyHighlightOffset = (
		path: string,
		transform: HighlightTransform
	) => {
		if (!path) return
		const p = createFilePath(path)

		const normalizedStart = transform.fromCharIndex
		const normalizedOldEnd = Math.max(normalizedStart, transform.oldEndIndex)
		const normalizedNewEnd = Math.max(normalizedStart, transform.newEndIndex)
		const normalizedCharDelta = normalizedNewEnd - normalizedOldEnd

		const normalizedOldEndRow = Math.max(
			transform.fromLineRow,
			transform.oldEndRow
		)
		const normalizedNewEndRow = Math.max(
			transform.fromLineRow,
			transform.newEndRow
		)
		const normalizedLineDelta = normalizedNewEndRow - normalizedOldEndRow

		const incoming = {
			...transform,
			charDelta: normalizedCharDelta,
			lineDelta: normalizedLineDelta,
			oldEndRow: normalizedOldEndRow,
			newEndRow: normalizedNewEndRow,
			oldEndIndex: normalizedOldEnd,
			newEndIndex: normalizedNewEnd,
		}

		const existing = highlightOffsets[p]

		// Attempt to merge back-to-back single char edits to keep the stack small
		if (existing && existing.length > 0) {
			const last = existing[existing.length - 1]!

			// Case 1: Sequential backspace (delete at 100, then delete at 99)
			const isBackspacing =
				last.lineDelta === 0 &&
				incoming.lineDelta === 0 &&
				last.charDelta < 0 &&
				incoming.charDelta === -1 &&
				incoming.fromCharIndex === last.fromCharIndex - 1

			if (isBackspacing) {
				const merged: HighlightTransform = {
					...last,
					fromCharIndex: incoming.fromCharIndex,
					charDelta: last.charDelta + incoming.charDelta,
					oldEndIndex: last.oldEndIndex,
					newEndIndex: incoming.newEndIndex,
				}
				const nextOffsets = [...existing]
				nextOffsets[existing.length - 1] = merged
				setHighlightOffsets(p, nextOffsets)
				return
			}

			// Case 2: Sequential typing (insert at 100, then insert at 101)
			const isTyping =
				last.lineDelta === 0 &&
				incoming.lineDelta === 0 &&
				incoming.charDelta > 0 &&
				incoming.fromCharIndex === last.fromCharIndex + last.charDelta

			if (isTyping) {
				const merged: HighlightTransform = {
					...last,
					charDelta: last.charDelta + incoming.charDelta,
					newEndIndex: incoming.newEndIndex,
				}
				const nextOffsets = [...existing]
				nextOffsets[existing.length - 1] = merged
				setHighlightOffsets(p, nextOffsets)
				return
			}
		}

		const nextOffsets = existing ? [...existing, incoming] : [incoming]
		setHighlightOffsets(p, nextOffsets)
	}

	const setHighlights = (path: string, highlights?: TreeSitterCapture[]) => {
		if (!path) return
		const p = createFilePath(path)

		const nextHighlights = highlights?.length ? highlights : undefined
		const existingHighlights = fileHighlights[p]
		const offsetCount = highlightOffsets[p]?.length ?? 0
		++highlightUpdateId

		// Clear pending offset - we have real data now
		const shouldClearOffsets = offsetCount > 0
		const hasNextHighlights = !!nextHighlights
		const hasExistingHighlights = !!existingHighlights?.length

		if (!shouldClearOffsets && !hasNextHighlights && !hasExistingHighlights) {
			return
		}

		batch(() => {
			if (shouldClearOffsets) {
				setHighlightOffsets(p, undefined)
			}
			setHighlightsStore(p, nextHighlights)
		})
	}

	const clearHighlights = () => {
		setHighlightsStore(reconcile({}))
		setHighlightOffsets(reconcile({}))
	}

	return {
		fileHighlights,
		highlightOffsets,
		setHighlights,
		applyHighlightOffset,
		clearHighlights,
	}
}
