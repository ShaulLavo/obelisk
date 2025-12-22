import { createMemo, type Accessor } from 'solid-js'
import { Lexer, type LineState } from '@repo/lexer'
import { ENABLE_LEXER } from '../consts'
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

type CachedLineHighlights = {
	start: number
	length: number
	text: string
	lexState: LineState['lexState']
	bracketDepth: number
	offset: number
	segments: LineHighlightSegment[]
}

export type CreateLineHighlightsOptions = {
	lexer: Lexer
	highlights?: Accessor<EditorSyntaxHighlight[] | undefined>
	errors?: Accessor<EditorError[] | undefined>
	lexerStates?: Accessor<LineState[] | undefined>
}

export const createLineHighlights = (options: CreateLineHighlightsOptions) => {
	const EMPTY_HIGHLIGHTS: EditorSyntaxHighlight[] = []
	const EMPTY_ERRORS: ErrorHighlight[] = []

	const sortedHighlights = createMemo(() => {
		const highlights = options.highlights?.()
		if (!highlights?.length) return EMPTY_HIGHLIGHTS
		return highlights.slice().sort((a, b) => a.startIndex - b.startIndex)
	})

	const sortedErrorHighlights = createMemo<ErrorHighlight[]>(() => {
		const errors = options.errors?.()
		if (!errors?.length) return EMPTY_ERRORS

		return errors
			.map((error) => ({
				startIndex: error.startIndex,
				endIndex: error.endIndex,
				scope: error.isMissing ? 'missing' : 'error',
			}))
			.sort((a, b) => a.startIndex - b.startIndex)
	})

	let spatialIndex: Map<number, EditorSyntaxHighlight[]> = new Map()
	let largeHighlights: EditorSyntaxHighlight[] = []
	const SPATIAL_CHUNK_SIZE = 512

	const buildSpatialIndex = (highlights: EditorSyntaxHighlight[]) => {
		spatialIndex.clear()
		largeHighlights = []

		for (const highlight of highlights) {
			if (
				highlight.startIndex === undefined ||
				highlight.endIndex === undefined ||
				highlight.endIndex <= highlight.startIndex
			) {
				continue
			}

			// If a highlight spans many chunks, treat it as "large" to avoid bloating the index
			// For example, a multi-line comment or string that spans > 10 chunks
			if (highlight.endIndex - highlight.startIndex > SPATIAL_CHUNK_SIZE * 10) {
				largeHighlights.push(highlight)
				continue
			}

			const startChunk = Math.floor(highlight.startIndex / SPATIAL_CHUNK_SIZE)
			const endChunk = Math.floor((highlight.endIndex - 1) / SPATIAL_CHUNK_SIZE)

			for (let i = startChunk; i <= endChunk; i++) {
				let bucket = spatialIndex.get(i)
				if (!bucket) {
					bucket = []
					spatialIndex.set(i, bucket)
				}
				bucket.push(highlight)
			}
		}
	}

	let highlightCache = new Map<number, CachedLineHighlights>()
	let lastHighlightsRef: EditorSyntaxHighlight[] | undefined
	let lastErrorsRef: ErrorHighlight[] | undefined
	let lastLexerStatesRef: LineState[] | undefined
	const MAX_HIGHLIGHT_CACHE_SIZE = 500

	const getLineHighlights = (entry: LineEntry): LineHighlightSegment[] => {
		const lineStart = entry.start
		const lineLength = entry.length
		const lineTextLength = entry.text.length
		const highlights = sortedHighlights()
		const errors = sortedErrorHighlights()
		const lexerStates = options.lexerStates?.()

		if (
			highlights !== lastHighlightsRef ||
			errors !== lastErrorsRef ||
			lexerStates !== lastLexerStatesRef
		) {
			highlightCache = new Map()
			lastHighlightsRef = highlights
			lastErrorsRef = errors
			lastLexerStatesRef = lexerStates
			buildSpatialIndex(highlights)
		}

		const cached = highlightCache.get(entry.index)
		if (
			cached !== undefined &&
			cached.start === lineStart &&
			cached.length === lineLength &&
			cached.text === entry.text
		) {
			const lineState =
				lexerStates?.[entry.index] ??
				options.lexer.getLineState(entry.index) ??
				Lexer.initialState()

			if (
				cached.lexState === lineState.lexState &&
				cached.bracketDepth === lineState.bracketDepth &&
				cached.offset === lineState.offset
			) {
				return cached.segments
			}
		}

		let highlightSegments: LineHighlightSegment[]
		if (highlights.length > 0) {
			const startChunk = Math.floor(lineStart / SPATIAL_CHUNK_SIZE)
			const endChunk = Math.floor(
				(lineStart + lineLength - 1) / SPATIAL_CHUNK_SIZE
			)

			// 2. Gather candidates
			const candidatesBuffer: EditorSyntaxHighlight[] = []

			if (largeHighlights.length > 0) {
				for (const h of largeHighlights) candidatesBuffer.push(h)
			}

			// Add bucketed highlights
			for (let i = startChunk; i <= endChunk; i++) {
				const bucket = spatialIndex.get(i)
				if (bucket) {
					for (const h of bucket) candidatesBuffer.push(h)
				}
			}

			// 3. Sort (mutates buffer)
			candidatesBuffer.sort((a, b) => a.startIndex - b.startIndex)

			// 4. Deduplicate in-place (if multiple chunks involved)
			// Only needed if we pulled from >1 source that could overlap.
			// Buckets overlap in content (same highlight in multiple buckets).
			let uniqueCount = candidatesBuffer.length
			if (startChunk !== endChunk && candidatesBuffer.length > 1) {
				let writeIndex = 1
				for (let i = 1; i < candidatesBuffer.length; i++) {
					// Compare with previous unique item
					if (candidatesBuffer[i] !== candidatesBuffer[writeIndex - 1]) {
						candidatesBuffer[writeIndex] = candidatesBuffer[i]!
						writeIndex++
					}
				}
				uniqueCount = writeIndex
				// Trimming not strictly necessary if we pass length, but toLineHighlightSegmentsForLine iterates input.
				// We must truncate the buffer to correct length for the callee.
				candidatesBuffer.length = uniqueCount
			}

			highlightSegments = toLineHighlightSegmentsForLine(
				lineStart,
				lineLength,
				lineTextLength,
				candidatesBuffer
			)
		} else if (ENABLE_LEXER) {
			const lineState =
				lexerStates?.[entry.index] ?? options.lexer.getLineState(entry.index)
			const { tokens } = options.lexer.tokenizeLine(
				entry.text,
				lineState ?? Lexer.initialState()
			)
			highlightSegments = options.lexer.tokensToSegments(
				tokens,
				getHighlightClassForScope
			)
		} else {
			highlightSegments = []
		}

		const errorSegments = toLineHighlightSegmentsForLine(
			lineStart,
			lineLength,
			lineTextLength,
			errors
		)

		const result = mergeLineSegments(highlightSegments, errorSegments)

		const lineState =
			lexerStates?.[entry.index] ??
			options.lexer.getLineState(entry.index) ??
			Lexer.initialState()

		highlightCache.set(entry.index, {
			start: lineStart,
			length: lineLength,
			text: entry.text,
			lexState: lineState.lexState,
			bracketDepth: lineState.bracketDepth,
			offset: lineState.offset,
			segments: result,
		})
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
