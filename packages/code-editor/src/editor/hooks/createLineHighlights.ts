import { createMemo, untrack, type Accessor } from 'solid-js'

import {
	mergeLineSegments,
	mapRangeToOldOffsets,
	toLineHighlightSegmentsForLine,
} from '../utils/highlights'
import type {
	EditorError,
	EditorSyntaxHighlight,
	HighlightOffsets,
	LineEntry,
	LineHighlightSegment,
} from '../types'

type ErrorHighlight = { startIndex: number; endIndex: number; scope: string }

type CachedLineHighlights = {
	length: number
	text: string
	segments: LineHighlightSegment[]
}

export type CreateLineHighlightsOptions = {
	highlights?: Accessor<EditorSyntaxHighlight[] | undefined>
	errors?: Accessor<EditorError[] | undefined>
	/** Offset for optimistic updates - applied lazily per-line */
	highlightOffset?: Accessor<HighlightOffsets | undefined>
}

export const createLineHighlights = (options: CreateLineHighlightsOptions) => {
	const EMPTY_HIGHLIGHTS: EditorSyntaxHighlight[] = []
	const EMPTY_ERRORS: ErrorHighlight[] = []
	const EMPTY_OFFSETS: HighlightOffsets = []

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

	let lastOffsetsRef: HighlightOffsets | undefined
	let validatedOffsetsRef: HighlightOffsets = EMPTY_OFFSETS
	let lineIndexCache: Map<number, number | null> | null = null
	let dirtyHighlightCache = new Map<number, CachedLineHighlights>()

	const getValidatedOffsets = (): HighlightOffsets => {
		const offsets = options.highlightOffset
			? (untrack(options.highlightOffset) ?? EMPTY_OFFSETS)
			: EMPTY_OFFSETS

		if (offsets === lastOffsetsRef) {
			return validatedOffsetsRef
		}

		lastOffsetsRef = offsets
		if (offsets.length === 0) {
			validatedOffsetsRef = EMPTY_OFFSETS
			lineIndexCache = null
			dirtyHighlightCache.clear()
			return validatedOffsetsRef
		}

		lineIndexCache = new Map()
		dirtyHighlightCache.clear()

		validatedOffsetsRef = offsets
		return validatedOffsetsRef
	}

	const mapLineIndexToOldOffsets = (
		lineIndex: number,
		offsets: HighlightOffsets
	): number | null => {
		if (offsets.length === 0) return lineIndex

		if (lineIndexCache && lineIndexCache.has(lineIndex)) {
			return lineIndexCache.get(lineIndex) ?? null
		}

		let mappedIndex = lineIndex
		for (let i = offsets.length - 1; i >= 0; i--) {
			const offset = offsets[i]
			if (!offset) continue

			const startRow = offset.fromLineRow
			const newEndRow = offset.newEndRow
			if (mappedIndex < startRow) continue

			if (mappedIndex <= newEndRow) {
				if (lineIndexCache) lineIndexCache.set(lineIndex, null)
				return null
			}

			mappedIndex -= offset.lineDelta
		}

		if (!Number.isFinite(mappedIndex)) {
			if (lineIndexCache) lineIndexCache.set(lineIndex, null)
			return null
		}

		if (lineIndexCache) lineIndexCache.set(lineIndex, mappedIndex)
		return mappedIndex
	}

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
		const lineEnd = lineStart + lineLength
		const highlights = sortedHighlights()
		const errors = sortedErrorHighlights()

		if (highlights !== lastHighlightsRef || errors !== lastErrorsRef) {
			highlightCache = new Map()
			dirtyHighlightCache.clear()
			lineIndexCache = null
			lastHighlightsRef = highlights
			lastErrorsRef = errors
			buildSpatialIndex(highlights)
		}

		const offsets = getValidatedOffsets()
		const hasOffsets = offsets.length > 0
		const cacheKey = hasOffsets
			? mapLineIndexToOldOffsets(entry.index, offsets)
			: entry.index
		const cacheMap = cacheKey === null ? dirtyHighlightCache : highlightCache
		const cacheIndex = cacheKey === null ? entry.index : cacheKey
		const cached = cacheMap.get(cacheIndex)
		if (
			cached !== undefined &&
			cached.length === lineLength &&
			cached.text === entry.text
		) {
			return cached.segments
		}

		let highlightSegments: LineHighlightSegment[]
		if (highlights.length > 0) {
			// Get offset for optimistic updates
			// Calculate the lookup position for the spatial index.
			// If edits are pending, map the new line range back to old coordinates.
			const lookupRange = hasOffsets
				? mapRangeToOldOffsets(lineStart, lineEnd, offsets)
				: { start: lineStart, end: lineEnd }
			let lookupStart = lookupRange.start
			let lookupEnd = lookupRange.end
			if (lookupStart < 0) lookupStart = 0
			if (lookupEnd < lookupStart) {
				lookupEnd = lookupStart
			}

			const startChunk = Math.floor(lookupStart / SPATIAL_CHUNK_SIZE)
			const lookupLast = lookupEnd > lookupStart ? lookupEnd - 1 : lookupStart
			const endChunk = Math.floor(lookupLast / SPATIAL_CHUNK_SIZE)

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
				hasOffsets ? offsets : undefined
			)
		} else {
			highlightSegments = []
		}

		const errorSegments = toLineHighlightSegmentsForLine(
			lineStart,
			lineLength,
			lineTextLength,
			errors,
			hasOffsets ? offsets : undefined
		)

		const result = mergeLineSegments(highlightSegments, errorSegments)

		cacheMap.set(cacheIndex, {
			length: lineLength,
			text: entry.text,
			segments: result,
		})
		if (cacheMap.size > MAX_HIGHLIGHT_CACHE_SIZE) {
			const firstKey = cacheMap.keys().next().value
			if (typeof firstKey === 'number') {
				cacheMap.delete(firstKey)
			}
		}

		return result
	}

	return { getLineHighlights }
}
