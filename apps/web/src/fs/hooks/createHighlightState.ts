import { batch } from 'solid-js'
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
	oldEndRow: number
	newEndRow: number
	oldEndIndex: number
	newEndIndex: number
}

export const createHighlightState = () => {
	const log = logger.withTag('highlights')

	const [fileHighlights, setHighlightsStore] = createStore<
		Record<string, TreeSitterCapture[] | undefined>
	>({})

	// Track pending offsets per file - avoid shifting all highlights per edit
	const [highlightOffsets, setHighlightOffsets] = createStore<
		Record<string, HighlightTransform[] | undefined>
	>({})

	let highlightUpdateId = 0

	const summarizeHighlights = (highlights?: TreeSitterCapture[]) => {
		if (!highlights?.length) {
			return { count: 0 }
		}

		const first = highlights[0]
		const last = highlights[highlights.length - 1]

		if (!first || !last) {
			return { count: highlights.length }
		}

		return {
			count: highlights.length,
			firstStart: first.startIndex,
			firstEnd: first.endIndex,
			firstScope: first.scope,
			lastStart: last.startIndex,
			lastEnd: last.endIndex,
			lastScope: last.scope,
		}
	}

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

		const nextHighlights = highlights?.length ? highlights : undefined
		const existingHighlights = fileHighlights[path]
		const offsetCount = highlightOffsets[path]?.length ?? 0
		const updateId = ++highlightUpdateId

		log.debug('[setHighlights] start', {
			path,
			updateId,
			offsetCount,
			existing: summarizeHighlights(existingHighlights),
			next: summarizeHighlights(nextHighlights),
		})

		// Clear pending offset - we have real data now
		const shouldClearOffsets = offsetCount > 0
		const hasNextHighlights = !!nextHighlights
		const hasExistingHighlights = !!existingHighlights?.length

		if (!shouldClearOffsets && !hasNextHighlights && !hasExistingHighlights) {
			log.debug('[setHighlights] noop', { path, updateId })
			return
		}

		batch(() => {
			if (shouldClearOffsets) {
				setHighlightOffsets(path, undefined)
			}
			setHighlightsStore(path, nextHighlights)
		})

		log.debug('[setHighlights] end', {
			path,
			updateId,
			offsetCount,
			nextCount: nextHighlights?.length ?? 0,
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
