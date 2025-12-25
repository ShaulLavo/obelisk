import { loggers } from '@repo/logger'
import type {
	EditorSyntaxHighlight,
	LineEntry,
	LineHighlightSegment,
} from '../types'

const log = loggers.codeEditor.withTag('highlights')
const assert = (
	condition: boolean,
	message: string,
	details?: Record<string, unknown>
) => {
	if (condition) return true
	log.warn(message, details)
	return false
}

const EXACT_SCOPE_CLASS: Record<string, string> = {
	comment: 'text-zinc-500',
	'comment.block': 'text-zinc-500',
	'comment.line': 'text-zinc-500',
	// Declaration keywords (let, const, var, function, class) - purple/violet for structure
	'keyword.declaration': 'text-violet-400',
	// Import/export keywords - magenta/pink for module boundaries
	'keyword.import': 'text-pink-400',
	// Type/interface keywords - cyan for type system structure
	'keyword.type': 'text-cyan-400',
	// Control flow keywords (if, else, for, return, etc.) - emerald for flow
	'keyword.control': 'text-emerald-300',
	'keyword.operator': 'text-emerald-300',
	// Type system
	'type.builtin': 'text-sky-300',
	'type.parameter': 'text-teal-300',
	'type.definition': 'text-sky-400',
	// Variables
	'variable.parameter': 'text-pink-300',
	'variable.builtin': 'text-orange-300',
	'punctuation.bracket': 'text-zinc-300',
	// Errors
	error:
		'underline decoration-wavy decoration-red-500 underline-offset-2 decoration-[1px]',
	missing:
		'underline decoration-wavy decoration-red-500 underline-offset-2 decoration-[1px]',
}

// ...

export const mergeLineSegments = (
	segsA: LineHighlightSegment[] | undefined,
	segsB: LineHighlightSegment[] | undefined
): LineHighlightSegment[] => {
	if (!segsA?.length) return segsB || []
	if (!segsB?.length) return segsA || []

	const points = new Set<number>()
	for (const s of segsA) {
		points.add(s.start)
		points.add(s.end)
	}
	for (const s of segsB) {
		points.add(s.start)
		points.add(s.end)
	}
	const sortedPoints = Array.from(points).sort((a, b) => a - b)
	const result: LineHighlightSegment[] = []

	for (let i = 0; i < sortedPoints.length - 1; i++) {
		const start = sortedPoints[i]!
		const end = sortedPoints[i + 1]!
		if (start >= end) continue

		const mid = (start + end) / 2
		const activeA = segsA.filter((s) => s.start <= mid && s.end >= mid)
		const activeB = segsB.filter((s) => s.start <= mid && s.end >= mid)

		if (activeA.length === 0 && activeB.length === 0) continue

		const classNames = new Set<string>()
		const scopes: string[] = []

		for (const s of activeA) {
			if (s.className) classNames.add(s.className)
			if (s.scope) scopes.push(s.scope)
		}
		for (const s of activeB) {
			if (s.className) classNames.add(s.className)
			if (s.scope) scopes.push(s.scope)
		}

		result.push({
			start,
			end,
			className: Array.from(classNames).join(' '),
			scope: scopes.join(' '),
		})
	}

	return result
}

const PREFIX_SCOPE_CLASS: Record<string, string> = {
	keyword: 'text-emerald-300',
	type: 'text-sky-300',
	function: 'text-rose-200',
	method: 'text-rose-200',
	property: 'text-purple-200',
	string: 'text-amber-200',
	number: 'text-indigo-200',
	operator: 'text-zinc-300',
	comment: 'text-zinc-500',
	constant: 'text-fuchsia-300',
	variable: 'text-zinc-200',
	punctuation: 'text-zinc-300',
	attribute: 'text-teal-200',
	namespace: 'text-cyan-200',
}

export const getHighlightClassForScope = (
	scope: string
): string | undefined => {
	if (!scope) return undefined
	if (EXACT_SCOPE_CLASS[scope]) {
		return EXACT_SCOPE_CLASS[scope]
	}
	const prefix = scope.split('.')[0] ?? ''
	return PREFIX_SCOPE_CLASS[prefix]
}

const clampToLine = (
	entry: LineEntry,
	absoluteStart: number,
	absoluteEnd: number
): [number, number] | null => {
	const lineStart = entry.start
	const visibleLength = entry.text.length
	const lineAbsoluteEnd = lineStart + entry.length
	const start = Math.max(absoluteStart, lineStart)
	const end = Math.min(absoluteEnd, lineAbsoluteEnd)
	const relativeStart = Math.max(0, Math.min(visibleLength, start - lineStart))
	const relativeEnd = Math.max(0, Math.min(visibleLength, end - lineStart))
	if (relativeStart >= relativeEnd) {
		return null
	}
	return [relativeStart, relativeEnd]
}

const clampToLineMeta = (
	lineStart: number,
	lineLength: number,
	lineTextLength: number,
	absoluteStart: number,
	absoluteEnd: number
): [number, number] | null => {
	const lineAbsoluteEnd = lineStart + lineLength
	const start = Math.max(absoluteStart, lineStart)
	const end = Math.min(absoluteEnd, lineAbsoluteEnd)
	const relativeStart = Math.max(0, Math.min(lineTextLength, start - lineStart))
	const relativeEnd = Math.max(0, Math.min(lineTextLength, end - lineStart))
	if (relativeStart >= relativeEnd) {
		return null
	}
	return [relativeStart, relativeEnd]
}

/**
 * Offset transformation to apply to highlights.
 * Applied inline during segment creation to avoid object allocation.
 */
export type HighlightShiftOffset = {
	charDelta: number
	fromCharIndex: number
	oldEndIndex: number
	newEndIndex: number
}

type HighlightRange = { start: number; end: number }

const mapBoundaryToOld = (
	position: number,
	offset: HighlightShiftOffset,
	boundary: 'start' | 'end'
) => {
	if (position <= offset.fromCharIndex) return position
	if (position >= offset.newEndIndex) {
		return position - (offset.newEndIndex - offset.oldEndIndex)
	}
	return boundary === 'start' ? offset.fromCharIndex : offset.oldEndIndex
}

const mapRangeToOldOffset = (
	rangeStart: number,
	rangeEnd: number,
	offset: HighlightShiftOffset
): HighlightRange => {
	const mappedStart = mapBoundaryToOld(rangeStart, offset, 'start')
	const mappedEnd = mapBoundaryToOld(rangeEnd, offset, 'end')
	const intersects = rangeStart < offset.newEndIndex && rangeEnd > offset.fromCharIndex
	if (!intersects) {
		const start = Math.min(mappedStart, mappedEnd)
		const end = Math.max(mappedStart, mappedEnd)
		return { start, end }
	}
	const start = Math.min(mappedStart, offset.fromCharIndex)
	const end = Math.max(mappedEnd, offset.oldEndIndex)
	return { start, end }
}

export const mapRangeToOldOffsets = (
	rangeStart: number,
	rangeEnd: number,
	offsets: HighlightShiftOffset[]
): HighlightRange => {
	let mappedStart = rangeStart
	let mappedEnd = rangeEnd

	for (let i = offsets.length - 1; i >= 0; i--) {
		const offset = offsets[i]
		if (!offset) continue
		const mapped = mapRangeToOldOffset(mappedStart, mappedEnd, offset)
		mappedStart = mapped.start
		mappedEnd = mapped.end
	}

	return {
		start: Math.min(mappedStart, mappedEnd),
		end: Math.max(mappedStart, mappedEnd),
	}
}

const pushRange = (
	output: HighlightRange[],
	start: number,
	end: number
) => {
	if (end <= start) return
	output.push({ start, end })
}

const applyOffsetToSegments = (
	segments: HighlightRange[],
	offset: HighlightShiftOffset,
	output: HighlightRange[]
) => {
	output.length = 0
	const offsetStart = offset.fromCharIndex
	const offsetOldEnd = offset.oldEndIndex
	const offsetNewEnd = offset.newEndIndex
	const offsetDelta = offsetNewEnd - offsetOldEnd

	for (const segment of segments) {
		const segmentStart = segment.start
		const segmentEnd = segment.end
		if (segmentEnd <= offsetStart) {
			pushRange(output, segmentStart, segmentEnd)
			continue
		}

		if (segmentStart >= offsetOldEnd) {
			pushRange(
				output,
				segmentStart + offsetDelta,
				segmentEnd + offsetDelta
			)
			continue
		}

		const spansEdit =
			segmentStart < offsetStart && segmentEnd > offsetOldEnd
		if (spansEdit) {
			if (offsetNewEnd === offsetStart) {
				pushRange(output, segmentStart, segmentEnd + offsetDelta)
				continue
			}
			pushRange(output, segmentStart, offsetStart)
			pushRange(output, offsetNewEnd, segmentEnd + offsetDelta)
			continue
		}

		const endsInEdit =
			segmentStart < offsetStart && segmentEnd <= offsetOldEnd
		if (endsInEdit) {
			pushRange(output, segmentStart, offsetStart)
			continue
		}

		const startsInEdit =
			segmentStart >= offsetStart &&
			segmentStart < offsetOldEnd &&
			segmentEnd > offsetOldEnd
		if (startsInEdit) {
			pushRange(output, offsetNewEnd, segmentEnd + offsetDelta)
		}
	}
}

const applyOffsetsToHighlight = (
	highlightStart: number,
	highlightEnd: number,
	offsets: HighlightShiftOffset[],
	bufferA: HighlightRange[],
	bufferB: HighlightRange[]
) => {
	bufferA.length = 0
	bufferA.push({ start: highlightStart, end: highlightEnd })

	let current = bufferA
	let next = bufferB

	for (const offset of offsets) {
		if (current.length === 0) break
		applyOffsetToSegments(current, offset, next)
		const swap = current
		current = next
		next = swap
	}

	return current
}

export const toLineHighlightSegmentsForLine = (
	lineStart: number,
	lineLength: number,
	lineTextLength: number,
	highlights: EditorSyntaxHighlight[] | undefined,
	offsets?: HighlightShiftOffset[]
): LineHighlightSegment[] => {
	if (!highlights?.length) {
		return []
	}

	const segments: LineHighlightSegment[] = []
	const lineEnd = lineStart + lineLength
	const hasOffsets = offsets !== undefined && offsets.length > 0
	let splitCount = 0
	let compareLineStart = lineStart
	let compareLineEnd = lineEnd

	const rangeBufferA: HighlightRange[] = []
	const rangeBufferB: HighlightRange[] = []

	if (hasOffsets) {
		for (const offset of offsets) {
			assert(
				Number.isFinite(offset.charDelta) &&
					Number.isFinite(offset.fromCharIndex) &&
					Number.isFinite(offset.oldEndIndex) &&
					Number.isFinite(offset.newEndIndex) &&
					offset.fromCharIndex >= 0 &&
					offset.oldEndIndex >= offset.fromCharIndex &&
					offset.newEndIndex >= offset.fromCharIndex,
				'Invalid highlight shift offset',
				{
					offset,
					lineStart,
					lineLength,
				}
			)
			const offsetDelta = offset.newEndIndex - offset.oldEndIndex
			if (offset.charDelta !== offsetDelta) {
				log.warn('Highlight shift delta mismatch', {
					offset,
					offsetDelta,
				})
			}
		}

		const mapped = mapRangeToOldOffsets(lineStart, lineEnd, offsets)
		compareLineStart = mapped.start
		compareLineEnd = mapped.end
		assert(
			Number.isFinite(compareLineStart) &&
				Number.isFinite(compareLineEnd) &&
				compareLineEnd >= compareLineStart,
			'Invalid line comparison range',
			{
				compareLineStart,
				compareLineEnd,
				lineStart,
				lineEnd,
				offsetCount: offsets.length,
			}
		)
	}

	const pushSegment = (
		absoluteStart: number,
		absoluteEnd: number,
		className: string,
		scope: string
	) => {
		if (absoluteEnd <= lineStart) return
		if (absoluteStart >= lineEnd) return

		const clamped = clampToLineMeta(
			lineStart,
			lineLength,
			lineTextLength,
			absoluteStart,
			absoluteEnd
		)
		if (!clamped) return

		const [relativeStart, relativeEnd] = clamped
		segments.push({
			start: relativeStart,
			end: relativeEnd,
			className,
			scope,
		})
	}

	for (const highlight of highlights) {
		if (
			highlight.startIndex === undefined ||
			highlight.endIndex === undefined ||
			highlight.endIndex <= highlight.startIndex
		) {
			continue
		}

		const highlightStart = highlight.startIndex
		const highlightEnd = highlight.endIndex

		if (!hasOffsets) {
			if (highlightEnd <= lineStart) {
				continue
			}

			if (highlightStart >= lineEnd) {
				break
			}

			const className = getHighlightClassForScope(highlight.scope)
			if (!className) continue

			pushSegment(highlightStart, highlightEnd, className, highlight.scope)
			continue
		}

		if (highlightEnd <= compareLineStart) {
			continue
		}
		if (highlightStart >= compareLineEnd) {
			break
		}

		const className = getHighlightClassForScope(highlight.scope)
		if (!className) continue

		const shiftedRanges = applyOffsetsToHighlight(
			highlightStart,
			highlightEnd,
			offsets,
			rangeBufferA,
			rangeBufferB
		)
		if (shiftedRanges.length > 1) {
			splitCount += 1
		}
		for (const range of shiftedRanges) {
			pushSegment(range.start, range.end, className, highlight.scope)
		}
	}

	if (splitCount > 0) {
		log.debug('Split highlights for optimistic edit offset', {
			splitCount,
			offsetCount: offsets?.length ?? 0,
			lineStart,
			lineLength,
		})
	}

	if (segments.length > 1) {
		segments.sort((a, b) => a.start - b.start)
	}

	return segments
}

const advanceToLineIndex = (
	lineEntries: LineEntry[],
	currentIndex: number,
	position: number
) => {
	let index = Math.max(0, currentIndex)
	while (index < lineEntries.length) {
		const entry = lineEntries[index]
		if (!entry) break
		const lineEnd = entry.start + entry.length
		if (position < lineEnd || index === lineEntries.length - 1) {
			return index
		}
		index++
	}
	return Math.max(0, lineEntries.length - 1)
}

export const toLineHighlightSegments = (
	lineEntries: LineEntry[],
	highlights: EditorSyntaxHighlight[] | undefined
): LineHighlightSegment[][] => {
	if (!highlights?.length || !lineEntries.length) {
		return []
	}

	const perLine: LineHighlightSegment[][] = new Array(lineEntries.length)
	let lineIndex = 0

	for (const highlight of highlights) {
		if (
			highlight.startIndex === undefined ||
			highlight.endIndex === undefined ||
			highlight.endIndex <= highlight.startIndex
		) {
			continue
		}

		const className = getHighlightClassForScope(highlight.scope)
		if (!className) continue

		let start = Math.max(0, highlight.startIndex)
		const end = Math.max(start, highlight.endIndex)
		lineIndex = advanceToLineIndex(lineEntries, lineIndex, start)

		let cursor = lineIndex
		while (cursor < lineEntries.length && start < end) {
			const entry = lineEntries[cursor]
			if (!entry) break
			const lineAbsoluteEnd = entry.start + entry.length
			if (start >= lineAbsoluteEnd) {
				cursor++
				continue
			}
			const clamped = clampToLine(entry, start, end)
			if (clamped) {
				const [relativeStart, relativeEnd] = clamped
				;(perLine[cursor] ??= []).push({
					start: relativeStart,
					end: relativeEnd,
					className,
					scope: highlight.scope,
				})
			}
			if (end <= lineAbsoluteEnd) {
				break
			}
			start = lineAbsoluteEnd
			cursor++
		}

		lineIndex = cursor
	}

	for (const segments of perLine) {
		if (segments && segments.length > 1) {
			segments.sort((a, b) => a.start - b.start)
		}
	}

	return perLine
}
