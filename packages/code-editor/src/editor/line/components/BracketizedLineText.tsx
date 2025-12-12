import { children, type Accessor, type JSX } from 'solid-js';
import type { BracketDepthMap, LineHighlightSegment } from '../../types';
import { getBracketDepthTextClass } from '../../theme/bracketColors';

type SegmentBuffer = {
	nodes: (string | JSX.Element)[]
	plain: string
}

type NormalizedHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

const createBuffer = (): SegmentBuffer => ({
	nodes: [],
	plain: ''
})

const flushPlain = (buffer: SegmentBuffer) => {
	if (!buffer.plain) return
	buffer.nodes.push(buffer.plain)
	buffer.plain = ''
}

const appendCharToBuffer = (
	buffer: SegmentBuffer,
	char: string,
	depth: number | undefined,
	absoluteIndex: number
) => {
	if (!depth) {
		buffer.plain += char
		return
	}
	flushPlain(buffer)
	buffer.nodes.push(
		<span
			class={getBracketDepthTextClass(depth)}
			data-depth={depth}
			data-bracket-index={absoluteIndex}
		>
			{char}
		</span>
	)
}

const bufferToContent = (
	buffer: SegmentBuffer
): string | (string | JSX.Element)[] | JSX.Element => {
	flushPlain(buffer)
	if (buffer.nodes.length === 0) return ''
	if (buffer.nodes.length === 1) return buffer.nodes[0]
	return buffer.nodes
}

const normalizeHighlightSegments = (
	segments: LineHighlightSegment[] | undefined,
	textLength: number
): NormalizedHighlightSegment[] => {
	if (!segments?.length) {
		return []
	}

	const clamped = segments
		.map(segment => {
			const start = Math.max(0, Math.min(textLength, segment.start))
			const end = Math.max(0, Math.min(textLength, segment.end))
			return {
				start,
				end,
				className: segment.className,
				scope: segment.scope
			}
		})
		.filter(segment => segment.end > segment.start)
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
			scope: segment.scope
		})
		cursor = end
	}

	return normalized
}

type BracketizedLineTextProps = {
	text: string
	lineStart: number
	bracketDepths: Accessor<BracketDepthMap | undefined>
	highlightSegments?: LineHighlightSegment[]
}

export const BracketizedLineText = (props: BracketizedLineTextProps) => {
	const segments = children(() => {
		const text = props.text
		if (text.length === 0) {
			return ''
		}

		const depthMap = props.bracketDepths()
		const highlights = normalizeHighlightSegments(
			props.highlightSegments,
			text.length
		)

		const baseBuffer = createBuffer()
		type ActiveHighlight = {
			segment: NormalizedHighlightSegment
			buffer: SegmentBuffer
		}
		let highlightIndex = 0
		let activeHighlight: ActiveHighlight | undefined

		const openHighlightIfNeeded = (position: number) => {
			if (activeHighlight) return
			const next = highlights[highlightIndex]
			if (!next || position < next.start) {
				return
			}
			flushPlain(baseBuffer)
			activeHighlight = {
				segment: next,
				buffer: createBuffer()
			}
			highlightIndex++
		}

		const closeHighlightIfNeeded = (position: number) => {
			if (!activeHighlight || position < activeHighlight.segment.end) {
				return
			}
			const { segment, buffer } = activeHighlight
			flushPlain(buffer)
			if (!buffer.nodes.length) {
				activeHighlight = undefined
				return
			}
			if (!segment.className) {
				for (const node of buffer.nodes) {
					baseBuffer.nodes.push(node)
				}
				activeHighlight = undefined
				return
			}
			baseBuffer.nodes.push(
				<span class={segment.className} data-highlight-scope={segment.scope}>
					{buffer.nodes.length === 1 ? buffer.nodes[0] : buffer.nodes}
				</span>
			)
			activeHighlight = undefined
		}

		for (let i = 0; i < text.length; i++) {
			closeHighlightIfNeeded(i)
			openHighlightIfNeeded(i)
			const target = activeHighlight?.buffer ?? baseBuffer
			const absoluteIndex = props.lineStart + i
			const depth = depthMap?.[absoluteIndex]
			appendCharToBuffer(target, text.charAt(i), depth, absoluteIndex)
		}

		closeHighlightIfNeeded(text.length)

		return bufferToContent(baseBuffer)
	})

	return <>{segments()}</>
}
