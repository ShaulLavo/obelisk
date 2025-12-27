import { createMemo, untrack, type Accessor } from 'solid-js'

import {
	mergeLineSegments,
	mapRangeToOldOffsets,
	toLineHighlightSegmentsForLine,
	toLineHighlightSegments,
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
	/** Full line entries for precomputing highlight segments */
	lineEntries?: Accessor<LineEntry[] | undefined>
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

	const precomputedSegments = createMemo<
		LineHighlightSegment[][] | undefined
	>(() => {
		const lineEntries = options.lineEntries?.()
		if (!lineEntries?.length) return undefined

		const offsets = options.highlightOffset?.()
		if (offsets && offsets.length > 0) return undefined

		const highlights = sortedHighlights()
		const errors = sortedErrorHighlights()
		const hasHighlights = highlights.length > 0
		const hasErrors = errors.length > 0
		if (!hasHighlights && !hasErrors) return undefined

		const highlightSegments = hasHighlights
			? toLineHighlightSegments(lineEntries, highlights)
			: []
		const errorSegments = hasErrors
			? toLineHighlightSegments(lineEntries, errors)
			: []

		if (!hasErrors) return highlightSegments
		if (!hasHighlights) return errorSegments

		const merged: LineHighlightSegment[][] = new Array(lineEntries.length)
		for (let i = 0; i < lineEntries.length; i += 1) {
			const mergedLine = mergeLineSegments(
				highlightSegments[i],
				errorSegments[i]
			)
			if (mergedLine.length > 0) merged[i] = mergedLine
		}
		return merged
	})

	let precomputedCache = new Map<number, LineHighlightSegment[]>()
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
			precomputedCache.clear()
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

	const toShiftOffsets = (
		offsets: HighlightOffsets,
		lineStart: number,
		lineEnd: number
	): { shift: number; intersects: boolean } => {
		let shift = 0
		let intersects = false

		for (const offset of offsets) {
			if (!offset) continue
			if (offset.newEndIndex <= lineStart) {
				shift += offset.charDelta
				continue
			}
			if (offset.fromCharIndex >= lineEnd) {
				continue
			}
			intersects = true
		}

		return { shift, intersects }
	}

	const applyShiftToSegments = (
		segments: LineHighlightSegment[],
		shift: number,
		lineTextLength: number
	): LineHighlightSegment[] => {
		if (segments.length === 0 || shift === 0) return segments

		const shifted: LineHighlightSegment[] = []
		for (const segment of segments) {
			const start = Math.max(0, Math.min(lineTextLength, segment.start + shift))
			const end = Math.max(0, Math.min(lineTextLength, segment.end + shift))
			if (end <= start) continue
			shifted.push({
				start,
				end,
				className: segment.className,
				scope: segment.scope,
			})
		}
		return shifted
	}

	let spatialIndex: Map<number, EditorSyntaxHighlight[]> = new Map()
	let largeHighlights: EditorSyntaxHighlight[] = []
	const SPATIAL_CHUNK_SIZE = 512
	const candidateScratch: EditorSyntaxHighlight[] = []
	let spatialIndexReady = false

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
		const offsets = getValidatedOffsets()
		const hasOffsets = offsets.length > 0

		const precomputed = hasOffsets ? undefined : precomputedSegments()
		if (precomputed && !hasOffsets) {
			const segments = precomputed[entry.index] ?? []
			lastHighlightsRef = sortedHighlights()
			lastErrorsRef = sortedErrorHighlights()
			if (segments.length > 0) {
				precomputedCache.set(entry.index, segments)
				if (precomputedCache.size > MAX_HIGHLIGHT_CACHE_SIZE) {
					const firstKey = precomputedCache.keys().next().value
					if (typeof firstKey === 'number') {
						precomputedCache.delete(firstKey)
					}
				}
			}
			return segments
		}

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
			precomputedCache.clear()
			lastHighlightsRef = highlights
			lastErrorsRef = errors
			spatialIndexReady = false
		}

		if (!spatialIndexReady) {
			buildSpatialIndex(highlights)
			spatialIndexReady = true
		}

		const offsetShift = hasOffsets
			? toShiftOffsets(offsets, lineStart, lineEnd)
			: { shift: 0, intersects: false }
		const offsetShiftAmount = offsetShift.shift
		const hasIntersectingOffsets = offsetShift.intersects
		const shouldApplyOffsets =
			hasOffsets && (hasIntersectingOffsets || offsetShiftAmount !== 0)
		const offsetsForSegments = shouldApplyOffsets ? offsets : undefined
		const mappedLineIndex = hasOffsets
			? mapLineIndexToOldOffsets(entry.index, offsets)
			: entry.index
		if (hasOffsets && mappedLineIndex !== null) {
			const cached = precomputedCache.get(mappedLineIndex)
			if (cached) {
				return cached
			}
		}
		const cacheKey = hasOffsets ? mappedLineIndex : entry.index
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

			let candidates: EditorSyntaxHighlight[] = []

			// Fast path: single bucket, no offsets, no large highlights
			if (!hasOffsets && largeHighlights.length === 0 && startChunk === endChunk) {
				const bucket = spatialIndex.get(startChunk)
				candidates = bucket ?? []
			} else {
				// 2. Gather candidates
				candidateScratch.length = 0
				if (largeHighlights.length > 0) {
					for (const h of largeHighlights) candidateScratch.push(h)
				}

				// Add bucketed highlights
				for (let i = startChunk; i <= endChunk; i++) {
					const bucket = spatialIndex.get(i)
					if (bucket) {
						for (const h of bucket) candidateScratch.push(h)
					}
				}

				// 3. Sort (mutates buffer)
				candidateScratch.sort((a, b) => a.startIndex - b.startIndex)

				// 4. Deduplicate in-place (if multiple chunks involved)
				// Only needed if we pulled from >1 source that could overlap.
				// Buckets overlap in content (same highlight in multiple buckets).
				let uniqueCount = candidateScratch.length
				if (startChunk !== endChunk && candidateScratch.length > 1) {
					let writeIndex = 1
					for (let i = 1; i < candidateScratch.length; i++) {
						// Compare with previous unique item
						if (candidateScratch[i] !== candidateScratch[writeIndex - 1]) {
							candidateScratch[writeIndex] = candidateScratch[i]!
							writeIndex++
						}
					}
					uniqueCount = writeIndex
					// Trimming not strictly necessary if we pass length, but toLineHighlightSegmentsForLine iterates input.
					// We must truncate the buffer to correct length for the callee.
					candidateScratch.length = uniqueCount
				}
				candidates = candidateScratch
			}

			// 5. Apply offset to candidates if needed (shift to new positions)
			// We pass the offset info to toLineHighlightSegmentsForLine to adjust
			// positions inline, avoiding object creation per-line.
			highlightSegments = toLineHighlightSegmentsForLine(
				lineStart,
				lineLength,
				lineTextLength,
				candidates,
				offsetsForSegments
			)
		} else {
			highlightSegments = []
		}

		const errorSegments = toLineHighlightSegmentsForLine(
			lineStart,
			lineLength,
			lineTextLength,
			errors,
			offsetsForSegments
		)

		const shiftedHighlightSegments = hasOffsets && !shouldApplyOffsets
			? applyShiftToSegments(
					highlightSegments,
					offsetShiftAmount,
					lineTextLength
				)
			: highlightSegments
		const shiftedErrorSegments = hasOffsets && !shouldApplyOffsets
			? applyShiftToSegments(errorSegments, offsetShiftAmount, lineTextLength)
			: errorSegments

		const result = mergeLineSegments(
			shiftedHighlightSegments,
			shiftedErrorSegments
		)

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
