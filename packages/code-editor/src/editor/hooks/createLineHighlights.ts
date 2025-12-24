import { createMemo, type Accessor } from 'solid-js'
import { loggers } from '@repo/logger'
import { trackMicro } from '@repo/perf'
import {
	mergeLineSegments,
	toLineHighlightSegmentsForLine,
} from '../utils/highlights'
import type {
	EditorError,
	EditorSyntaxHighlight,
	HighlightOffset,
	LineEntry,
	LineHighlightSegment,
} from '../types'

type ErrorHighlight = { startIndex: number; endIndex: number; scope: string }

type CachedLineHighlights = {
	start: number
	length: number
	text: string
	segments: LineHighlightSegment[]
	/** Char offset applied when this cache entry was created */
	appliedCharDelta?: number
}

export type CreateLineHighlightsOptions = {
	highlights?: Accessor<EditorSyntaxHighlight[] | undefined>
	errors?: Accessor<EditorError[] | undefined>
	/** Offset for optimistic updates - applied lazily per-line */
	highlightOffset?: Accessor<HighlightOffset | undefined>
}

export const createLineHighlights = (options: CreateLineHighlightsOptions) => {
	const log = loggers.codeEditor.withTag('line-highlights')
	const assert = (
		condition: boolean,
		message: string,
		details?: Record<string, unknown>
	) => {
		if (condition) return true
		log.warn(message, details)
		return false
	}
	const EMPTY_HIGHLIGHTS: EditorSyntaxHighlight[] = []
	const EMPTY_ERRORS: ErrorHighlight[] = []
	const HIGHLIGHT_SORT_LOG_THRESHOLD_MS = 4

	const sortedHighlights = createMemo(() => {
		const highlights = options.highlights?.()
		if (!highlights?.length) return EMPTY_HIGHLIGHTS
		return trackMicro(
			'line-highlights:sort',
			() => highlights.slice().sort((a, b) => a.startIndex - b.startIndex),
			{
				logger: log,
				threshold: HIGHLIGHT_SORT_LOG_THRESHOLD_MS,
				metadata: { count: highlights.length },
			}
		)
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
			buildSpatialIndex(highlights)
		}

		assert(lineLength >= lineTextLength, 'Line length shorter than text', {
			lineStart,
			lineLength,
			lineTextLength,
		})

		const offset = options.highlightOffset?.()
		const appliedCharDelta =
			offset && lineStart >= offset.fromCharIndex ? offset.charDelta : 0
		const cached = highlightCache.get(entry.index)
		if (
			cached !== undefined &&
			cached.start === lineStart &&
			cached.length === lineLength &&
			cached.text === entry.text &&
			cached.appliedCharDelta === appliedCharDelta
		) {
			return cached.segments
		}

		let highlightSegments: LineHighlightSegment[]
		if (highlights.length > 0) {
			// Get offset for optimistic updates
			// Calculate the lookup position for the spatial index.
			// If we have an offset and this line is after the edit point,
			// we need to look up highlights at their OLD positions.
			let lookupStart = lineStart
			let charDelta = appliedCharDelta
			if (offset && appliedCharDelta !== 0) {
				// This line is after the edit point, so adjust lookup to old position
				lookupStart = lineStart - appliedCharDelta
			}

			const startChunk = Math.floor(lookupStart / SPATIAL_CHUNK_SIZE)
			const endChunk = Math.floor(
				(lookupStart + lineLength - 1) / SPATIAL_CHUNK_SIZE
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

			// 5. Apply offset to candidates if needed (shift to new positions)
			// We pass the offset info to toLineHighlightSegmentsForLine to adjust
			// positions inline, avoiding object creation per-line.
			highlightSegments = toLineHighlightSegmentsForLine(
				lineStart,
				lineLength,
				lineTextLength,
				candidatesBuffer,
				charDelta !== 0
					? { charDelta, fromCharIndex: offset!.fromCharIndex }
					: undefined
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

		highlightCache.set(entry.index, {
			start: lineStart,
			length: lineLength,
			text: entry.text,
			segments: result,
			appliedCharDelta,
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
