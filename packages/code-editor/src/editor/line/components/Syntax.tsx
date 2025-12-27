import { createMemo, type Accessor, type JSX } from 'solid-js'
import type { LineBracketDepthMap, LineHighlightSegment } from '../../types'
import { useTextRunsHtml } from '../hooks/useTextRuns'
import { getBracketDepthTextClass } from '../../theme/bracketColors'
import { buildTextRunsHtml, type TextRun } from '../utils/textRuns'

type SyntaxProps = {
	text: string
	bracketDepths?: LineBracketDepthMap
	highlightSegments?: LineHighlightSegment[]
	columnStart?: number
	columnEnd?: number
	cachedRuns?: TextRun[]

	lineIndex: number
	isEditable: Accessor<boolean>
	style: JSX.CSSProperties | string
	onMouseDown: (event: MouseEvent) => void
	ref: (el: HTMLDivElement | null) => void
}

export const Syntax = (props: SyntaxProps) => {
	const computedHtml = useTextRunsHtml({
		text: () => props.text,
		bracketDepths: () => props.bracketDepths,
		highlightSegments: () => props.highlightSegments,
		columnStart: () => props.columnStart,
		columnEnd: () => props.columnEnd,
	})

	const cachedHtml = createMemo(() => {
		const runs = props.cachedRuns
		if (!runs) return undefined

		return buildTextRunsHtml(runs, getBracketDepthTextClass)
	})

	return (
		<div
			ref={props.ref}
			data-index={props.lineIndex}
			class="editor-line"
			classList={{
				'cursor-text': props.isEditable(),
			}}
			style={props.style}
			onMouseDown={(e) => props.onMouseDown(e)}
			// eslint-disable-next-line solid/no-innerhtml
			innerHTML={cachedHtml() ?? computedHtml()}
		/>
	)
}
