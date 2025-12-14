import type {
	EditorSyntaxHighlight,
	LineEntry,
	LineHighlightSegment,
} from '../types'

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

const getHighlightClassForScope = (scope: string): string | undefined => {
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
	const relativeStart = Math.max(
		0,
		Math.min(lineTextLength, start - lineStart)
	)
	const relativeEnd = Math.max(0, Math.min(lineTextLength, end - lineStart))
	if (relativeStart >= relativeEnd) {
		return null
	}
	return [relativeStart, relativeEnd]
}

export const toLineHighlightSegmentsForLine = (
	lineStart: number,
	lineLength: number,
	lineTextLength: number,
	highlights: EditorSyntaxHighlight[] | undefined
): LineHighlightSegment[] => {
	if (!highlights?.length) {
		return []
	}

	const segments: LineHighlightSegment[] = []
	const lineEnd = lineStart + lineLength

	for (const highlight of highlights) {
		if (
			highlight.startIndex === undefined ||
			highlight.endIndex === undefined ||
			highlight.endIndex <= highlight.startIndex
		) {
			continue
		}

		if (highlight.endIndex <= lineStart) {
			continue
		}

		if (highlight.startIndex >= lineEnd) {
			break
		}

		const className = getHighlightClassForScope(highlight.scope)
		if (!className) continue

		const clamped = clampToLineMeta(
			lineStart,
			lineLength,
			lineTextLength,
			highlight.startIndex,
			highlight.endIndex
		)
		if (!clamped) continue

		const [relativeStart, relativeEnd] = clamped
		segments.push({
			start: relativeStart,
			end: relativeEnd,
			className,
			scope: highlight.scope,
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
