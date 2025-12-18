import { createMemo, type Accessor, type JSX } from 'solid-js'
import type { BracketDepthMap, LineHighlightSegment } from '../../types'
import { getBracketDepthTextClass } from '../../theme/bracketColors'

type NormalizedHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

/**
 * A text run with optional styling. Represents a contiguous chunk of text
 * that can be rendered as a single DOM node or span.
 */
type TextRun = {
	text: string
	// For bracket coloring
	depth?: number
	// For syntax highlighting
	highlightClass?: string
	highlightScope?: string
}

const normalizeHighlightSegments = (
	segments: LineHighlightSegment[] | undefined,
	textLength: number
): NormalizedHighlightSegment[] => {
	if (!segments?.length) {
		return []
	}

	const clamped = segments
		.map((segment) => {
			const start = Math.max(0, Math.min(textLength, segment.start))
			const end = Math.max(0, Math.min(textLength, segment.end))
			return {
				start,
				end,
				className: segment.className,
				scope: segment.scope,
			}
		})
		.filter((segment) => segment.end > segment.start)
		.sort((a, b) => a.start - b.start)

	const normalized: NormalizedHighlightSegment[] = []
	let cursor = 0

	for (const segment of clamped) {
		const start = Math.max(cursor, segment.start)
		const end = Math.max(start, segment.end)
		if (end <= start) continue
		normalized.push({
			start,
			end,
			className: segment.className,
			scope: segment.scope,
		})
		cursor = end
	}

	return normalized
}

/**
 * Build text runs by iterating through the text and grouping consecutive
 * characters with the same styling (bracket depth + highlight) together.
 * This is much more efficient than creating a span per character.
 */
const buildTextRuns = (
	text: string,
	lineStart: number,
	depthMap: BracketDepthMap | undefined,
	highlights: NormalizedHighlightSegment[]
): TextRun[] => {
	if (text.length === 0) return []

	const runs: TextRun[] = []
	let currentRun: TextRun | null = null

	let highlightIdx = 0
	const numHighlights = highlights.length
	let currentHighlight: NormalizedHighlightSegment | undefined = highlights[0]

	for (let i = 0; i < text.length; i++) {
		// 1. Advance the highlight cursor if we've passed the current one
		while (currentHighlight && i >= currentHighlight.end) {
			highlightIdx++
			currentHighlight =
				highlightIdx < numHighlights ? highlights[highlightIdx] : undefined
		}

		// 2. Simply check if we are inside the current highlight (no searching needed)
		let activeHighlight: NormalizedHighlightSegment | undefined
		if (currentHighlight && i >= currentHighlight.start) {
			activeHighlight = currentHighlight
		}

		const char = text[i]!
		const absoluteIndex = lineStart + i
		const depth = depthMap?.[absoluteIndex]

		// Check if we can extend the current run
		const canExtend =
			currentRun &&
			currentRun.depth === depth &&
			currentRun.highlightClass === activeHighlight?.className &&
			currentRun.highlightScope === activeHighlight?.scope

		if (canExtend) {
			currentRun!.text += char
		} else {
			// Start a new run
			currentRun = {
				text: char,
				depth,
				highlightClass: activeHighlight?.className,
				highlightScope: activeHighlight?.scope,
			}
			runs.push(currentRun)
		}
	}

	return runs
}

/**
 * Render a text run to JSX. Plain text is returned as-is,
 * styled runs get wrapped in appropriate spans.
 */
const renderRun = (run: TextRun): string | JSX.Element => {
	const hasDepth = run.depth !== undefined && run.depth > 0
	const hasHighlight = !!run.highlightClass

	// Plain text - no wrapping needed
	if (!hasDepth && !hasHighlight) {
		return run.text
	}

	// Only bracket depth
	if (hasDepth && !hasHighlight) {
		return (
			<span class={getBracketDepthTextClass(run.depth!)} data-depth={run.depth}>
				{run.text}
			</span>
		)
	}

	// Only highlight
	if (!hasDepth && hasHighlight) {
		return (
			<span
				class={run.highlightClass}
				data-highlight-scope={run.highlightScope}
			>
				{run.text}
			</span>
		)
	}

	// Both bracket depth and highlight - nest them
	return (
		<span class={run.highlightClass} data-highlight-scope={run.highlightScope}>
			<span class={getBracketDepthTextClass(run.depth!)} data-depth={run.depth}>
				{run.text}
			</span>
		</span>
	)
}

type BracketizedLineTextProps = {
	text: string
	lineStart: number
	bracketDepths: Accessor<BracketDepthMap | undefined>
	highlightSegments?: LineHighlightSegment[]
}

export const BracketizedLineText = (props: BracketizedLineTextProps) => {
	// Use createMemo instead of children() - we're not resolving passed children,
	// just computing derived content
	const content = createMemo(() => {
		const text = props.text
		if (text.length === 0) {
			return ''
		}

		const depthMap = props.bracketDepths()
		const highlights = normalizeHighlightSegments(
			props.highlightSegments,
			text.length
		)

		// Build optimized text runs - groups consecutive chars with same styling
		const runs = buildTextRuns(text, props.lineStart, depthMap, highlights)

		// Fast path: single unstyled run = just return the text
		const firstRun = runs[0]
		if (
			runs.length === 1 &&
			firstRun &&
			!firstRun.depth &&
			!firstRun.highlightClass
		) {
			return firstRun.text
		}

		// Render all runs
		const nodes = runs.map(renderRun)
		return nodes.length === 1 ? nodes[0] : nodes
	})

	return <>{content()}</>
}
