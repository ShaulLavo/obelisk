import { createMemo, type Accessor, type JSX } from 'solid-js'
import type { BracketDepthMap } from '../../types'

const BRACKET_COLOR_CLASSES = [
	'text-emerald-300',
	'text-sky-300',
	'text-indigo-300',
	'text-rose-300',
	'text-amber-300',
	'text-lime-300'
] as const

const getBracketClass = (depth: number) => {
	const normalized = Math.max(depth - 1, 0)
	return BRACKET_COLOR_CLASSES[normalized % BRACKET_COLOR_CLASSES.length]!
}

type BracketizedLineTextProps = {
	text: string
	lineStart: number
	bracketDepths: Accessor<BracketDepthMap | undefined>
}

export const BracketizedLineText = (props: BracketizedLineTextProps) => {
	const segments = createMemo(() => {
		const text = props.text
		const depthMap = props.bracketDepths()

		if (!depthMap || text.length === 0) {
			return text
		}

		const segments: (string | JSX.Element)[] = []
		let cursor = 0

		for (let i = 0; i < text.length; i++) {
			const absoluteIndex = props.lineStart + i
			const depth = depthMap[absoluteIndex]
			if (!depth) continue

			if (cursor < i) {
				segments.push(text.slice(cursor, i))
			}

			const className = getBracketClass(depth)
			segments.push(
				<span
					class={className}
					data-depth={depth}
					data-bracket-index={absoluteIndex}
				>
					{text[i]}
				</span>
			)
			cursor = i + 1
		}

		if (!segments.length) {
			return text
		}

		if (cursor < text.length) {
			segments.push(text.slice(cursor))
		}

		return segments
	})

	return <>{segments()}</>
}
