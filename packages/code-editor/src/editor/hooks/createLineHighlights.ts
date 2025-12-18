import { createMemo, type Accessor } from 'solid-js'
import { Lexer } from '@repo/lexer'
import {
	mergeLineSegments,
	toLineHighlightSegmentsForLine,
	getHighlightClassForScope,
} from '../utils/highlights'
import type {
	EditorError,
	EditorSyntaxHighlight,
	LineEntry,
	LineHighlightSegment,
} from '../types'

type ErrorHighlight = { startIndex: number; endIndex: number; scope: string }

export type CreateLineHighlightsOptions = {
	lexer: Lexer
	highlights?: Accessor<EditorSyntaxHighlight[] | undefined>
	errors?: Accessor<EditorError[] | undefined>
}

export const createLineHighlights = (options: CreateLineHighlightsOptions) => {
	const sortedHighlights = createMemo(() => {
		const highlights = options.highlights?.()
		if (!highlights?.length) return []
		return highlights.slice().sort((a, b) => a.startIndex - b.startIndex)
	})

	const sortedErrorHighlights = createMemo<ErrorHighlight[]>(() => {
		const errors = options.errors?.()
		if (!errors?.length) return []

		return errors
			.map((error) => ({
				startIndex: error.startIndex,
				endIndex: error.endIndex,
				scope: error.isMissing ? 'missing' : 'error',
			}))
			.sort((a, b) => a.startIndex - b.startIndex)
	})

	let highlightCache = new Map<number, LineHighlightSegment[]>()
	let lastHighlightsRef: EditorSyntaxHighlight[] | undefined
	let lastErrorsRef: ErrorHighlight[] | undefined
	const MAX_HIGHLIGHT_CACHE_SIZE = 500

	const getLineHighlights = (entry: LineEntry): LineHighlightSegment[] => {
		const lineStart = entry.start
		const lineLength = entry.length
		const lineTextLength = entry.text.length
		const highlights = sortedHighlights()
		const errors = sortedErrorHighlights()

		if (highlights !== lastHighlightsRef || errors !== lastErrorsRef) {
			highlightCache = new Map()
			lastHighlightsRef = highlights
			lastErrorsRef = errors
		}

		const cached = highlightCache.get(entry.index)
		if (cached !== undefined) return cached

		let highlightSegments: LineHighlightSegment[]
		if (highlights.length > 0) {
			highlightSegments = toLineHighlightSegmentsForLine(
				lineStart,
				lineLength,
				lineTextLength,
				highlights
			)
		} else {
			const lineState = options.lexer.getLineState(entry.index)
			const { tokens } = options.lexer.tokenizeLine(
				entry.text,
				lineState ?? Lexer.initialState()
			)
			highlightSegments = options.lexer.tokensToSegments(
				tokens,
				getHighlightClassForScope
			)
		}

		const errorSegments = toLineHighlightSegmentsForLine(
			lineStart,
			lineLength,
			lineTextLength,
			errors
		)

		const result = mergeLineSegments(highlightSegments, errorSegments)

		highlightCache.set(entry.index, result)
		if (highlightCache.size > MAX_HIGHLIGHT_CACHE_SIZE) {
			const firstKey = highlightCache.keys().next().value
			if (typeof firstKey === 'number') {
				highlightCache.delete(firstKey)
			}
		}

		return result
	}

	return { getLineHighlights }
}

