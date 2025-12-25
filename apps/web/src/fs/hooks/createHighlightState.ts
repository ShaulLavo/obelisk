import { createStore, reconcile } from 'solid-js/store'
import { logger } from '../../logger'
import type { TreeSitterCapture } from '../../workers/treeSitterWorkerTypes'

/**
 * Represents a pending offset transformation for highlights.
 * Instead of recreating 10k highlight objects per keystroke,
 * we store lightweight edit offsets and apply them lazily.
 */
export type HighlightTransform = {
	charDelta: number
	lineDelta: number
	fromCharIndex: number
	fromLineRow: number
	oldEndIndex: number
	newEndIndex: number
}

export const createHighlightState = () => {
	const log = logger.withTag('highlights')
	const assert = (
		condition: boolean,
		message: string,
		details?: Record<string, unknown>
	) => {
		if (condition) return true
		log.warn(message, details)
		return false
	}

	const [fileHighlights, setHighlightsStore] = createStore<
		Record<string, TreeSitterCapture[] | undefined>
	>({})

	// Track pending offsets per file - avoid shifting all highlights per edit
	const [highlightOffsets, setHighlightOffsets] = createStore<
		Record<string, HighlightTransform[] | undefined>
	>({})

	/**
	 * Apply an offset transformation optimistically.
	 * This keeps an ordered queue of edits for lazy per-line shifts.
	 */
	const applyHighlightOffset = (
		path: string,
		transform: HighlightTransform
	) => {
		if (!path) return

		const normalizedStart = transform.fromCharIndex
		const normalizedOldEnd = Math.max(normalizedStart, transform.oldEndIndex)
		const normalizedNewEnd = Math.max(normalizedStart, transform.newEndIndex)
		const normalizedCharDelta = normalizedNewEnd - normalizedOldEnd

		assert(
			Number.isFinite(transform.charDelta) &&
				Number.isFinite(transform.fromCharIndex) &&
				Number.isFinite(transform.oldEndIndex) &&
				Number.isFinite(transform.newEndIndex) &&
				transform.oldEndIndex >= transform.fromCharIndex &&
				transform.newEndIndex >= transform.fromCharIndex,
			'Invalid highlight transform',
			{ path, transform }
		)
		if (transform.charDelta !== normalizedCharDelta) {
			log.warn('Highlight transform delta mismatch', {
				path,
				transform,
				normalizedCharDelta,
			})
		}

		const incoming = {
			...transform,
			charDelta: normalizedCharDelta,
			oldEndIndex: normalizedOldEnd,
			newEndIndex: normalizedNewEnd,
		}

		const existing = highlightOffsets[path]
		const nextOffsets = existing ? [...existing, incoming] : [incoming]
		setHighlightOffsets(path, nextOffsets)
	}

	/**
	 * Set highlights from tree-sitter.
	 * This clears any pending offset since we now have accurate data.
	 */
	const setHighlights = (path: string, highlights?: TreeSitterCapture[]) => {
		if (!path) return

		// Clear pending offset - we have real data now
		setHighlightOffsets(path, undefined)

		if (!highlights?.length) {
			setHighlightsStore(path, undefined)
			return
		}

		setHighlightsStore(path, highlights)
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
