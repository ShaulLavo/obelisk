import type {
	EditorSyntaxHighlight,
	LineEntry,
	LineHighlightSegment,
} from '../types'

/**
 * Maps tree-sitter scopes to CSS class names.
 * Classes are defined in packages/code-editor/src/styles.css and read CSS vars.
 */

// Exact scope -> CSS class mapping
const EXACT_SCOPE_CLASS: Record<string, string> = {
	comment: 'syntax-comment',
	'comment.block': 'syntax-comment',
	'comment.line': 'syntax-comment',
	'keyword.declaration': 'syntax-keyword-declaration',
	'keyword.import': 'syntax-keyword-import',
	'keyword.type': 'syntax-keyword-type',
	'keyword.control': 'syntax-keyword-control',
	'keyword.operator': 'syntax-keyword-operator',
	'type.builtin': 'syntax-type-builtin',
	'type.parameter': 'syntax-type-parameter',
	'type.definition': 'syntax-type-definition',
	'variable.parameter': 'syntax-variable-parameter',
	'variable.builtin': 'syntax-variable-builtin',
	'punctuation.bracket': 'syntax-punctuation-bracket',
	error: 'syntax-error',
	missing: 'syntax-missing',
}

// Prefix fallback mapping
const PREFIX_SCOPE_CLASS: Record<string, string> = {
	keyword: 'syntax-keyword',
	type: 'syntax-type',
	function: 'syntax-function',
	method: 'syntax-method',
	property: 'syntax-property',
	string: 'syntax-string',
	number: 'syntax-number',
	operator: 'syntax-operator',
	comment: 'syntax-comment',
	constant: 'syntax-constant',
	variable: 'syntax-variable',
	punctuation: 'syntax-punctuation',
	attribute: 'syntax-attribute',
	namespace: 'syntax-namespace',
}

const SCOPE_CACHE = new Map<string, string | undefined>()

/**
 * Get the CSS class name for a tree-sitter scope.
 */
export const getHighlightClassForScope = (
	scope: string
): string | undefined => {
	if (!scope) return undefined
	if (SCOPE_CACHE.has(scope)) return SCOPE_CACHE.get(scope)

	// Try exact match first
	let result = EXACT_SCOPE_CLASS[scope]

	if (!result) {
		// Fall back to prefix match
		const prefix = scope.split('.')[0] ?? ''
		result = PREFIX_SCOPE_CLASS[prefix]
	}

	SCOPE_CACHE.set(scope, result)
	return result
}

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
	// For highlighting purposes:
	// If the boundary is inside the edited range, we clamp it to the start/end of the old range
	// so that the highlight doesn't disappear if it was partially covered by the edit.
	// But it depends on whether we want to verify intersection strictness.
	// For now, mapping to insertion point (fromCharIndex) or old end index is correct.
	return boundary === 'start' ? offset.fromCharIndex : offset.oldEndIndex
}

const mapRangeToOldOffset = (
	rangeStart: number,
	rangeEnd: number,
	offset: HighlightShiftOffset,
	out: { start: number; end: number }
) => {
	const mappedStart = mapBoundaryToOld(rangeStart, offset, 'start')
	const mappedEnd = mapBoundaryToOld(rangeEnd, offset, 'end')
	const intersects =
		rangeStart < offset.newEndIndex && rangeEnd > offset.fromCharIndex
	if (!intersects) {
		out.start = Math.min(mappedStart, mappedEnd)
		out.end = Math.max(mappedStart, mappedEnd)
		return
	}
	out.start = Math.min(mappedStart, offset.fromCharIndex)
	out.end = Math.max(mappedEnd, offset.oldEndIndex)
}

export const mapRangeToOldOffsets = (
	rangeStart: number,
	rangeEnd: number,
	offsets: HighlightShiftOffset[]
): { start: number; end: number } => {
	let mappedStart = rangeStart
	let mappedEnd = rangeEnd
	const scratch = { start: 0, end: 0 }

	for (let i = offsets.length - 1; i >= 0; i--) {
		const offset = offsets[i]
		if (!offset) continue
		mapRangeToOldOffset(mappedStart, mappedEnd, offset, scratch)
		mappedStart = scratch.start
		mappedEnd = scratch.end
	}

	return {
		start: Math.min(mappedStart, mappedEnd),
		end: Math.max(mappedStart, mappedEnd),
	}
}

const pushRange = (output: number[], start: number, end: number) => {
	if (end <= start) return
	output.push(start, end)
}

const applyOffsetToSegments = (
	segments: number[],
	offset: HighlightShiftOffset,
	output: number[]
) => {
	output.length = 0
	const offsetStart = offset.fromCharIndex
	const offsetOldEnd = offset.oldEndIndex
	const offsetNewEnd = offset.newEndIndex
	const offsetDelta = offsetNewEnd - offsetOldEnd

	for (let i = 0; i < segments.length; i += 2) {
		const segmentStart = segments[i]!
		const segmentEnd = segments[i + 1]!

		if (segmentEnd <= offsetStart) {
			pushRange(output, segmentStart, segmentEnd)
			continue
		}

		if (segmentStart >= offsetOldEnd) {
			pushRange(output, segmentStart + offsetDelta, segmentEnd + offsetDelta)
			continue
		}

		const spansEdit = segmentStart < offsetStart && segmentEnd > offsetOldEnd
		if (spansEdit) {
			if (offsetNewEnd === offsetStart) {
				pushRange(output, segmentStart, segmentEnd + offsetDelta)
				continue
			}
			pushRange(output, segmentStart, offsetStart)
			pushRange(output, offsetNewEnd, segmentEnd + offsetDelta)
			continue
		}

		const endsInEdit = segmentStart < offsetStart && segmentEnd <= offsetOldEnd
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
	bufferA: number[],
	bufferB: number[]
) => {
	bufferA.length = 0
	bufferA.push(highlightStart, highlightEnd)

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

	let compareLineStart = lineStart
	let compareLineEnd = lineEnd

	const rangeBufferA: number[] = []
	const rangeBufferB: number[] = []

	if (hasOffsets) {
		const mapped = mapRangeToOldOffsets(lineStart, lineEnd, offsets)
		compareLineStart = mapped.start
		compareLineEnd = mapped.end
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

			const className =
				highlight.className ?? getHighlightClassForScope(highlight.scope)
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

		const className =
			highlight.className ?? getHighlightClassForScope(highlight.scope)
		if (!className) continue

		const shiftedRanges = applyOffsetsToHighlight(
			highlightStart,
			highlightEnd,
			offsets,
			rangeBufferA,
			rangeBufferB
		)

		for (let i = 0; i < shiftedRanges.length; i += 2) {
			pushSegment(
				shiftedRanges[i]!,
				shiftedRanges[i + 1]!,
				className,
				highlight.scope
			)
		}
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

		const className =
			highlight.className ?? getHighlightClassForScope(highlight.scope)
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
