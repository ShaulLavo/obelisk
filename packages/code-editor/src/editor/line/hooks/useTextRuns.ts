import { createMemo, type Accessor } from 'solid-js'
import type { LineBracketDepthMap, LineHighlightSegment } from '../../types'
import {
	type TextRun,
	normalizeHighlightSegments,
	buildTextRuns,
} from '../utils/textRuns'

export type UseTextRunsOptions = {
	text: Accessor<string>
	bracketDepths: Accessor<LineBracketDepthMap | undefined>
	highlightSegments: Accessor<LineHighlightSegment[] | undefined>
	columnStart: Accessor<number | undefined>
	columnEnd: Accessor<number | undefined>
}

/**
 * Reactive hook that computes text runs for syntax-highlighted line rendering.
 * Groups consecutive characters with identical styling into runs for efficient DOM rendering.
 */
export const useTextRuns = (
	options: UseTextRunsOptions
): Accessor<TextRun[]> => {
	const runs = createMemo(() => {
		const text = options.text()
		if (text.length === 0) {
			return []
		}

		const depthMap = options.bracketDepths()
		const highlights = normalizeHighlightSegments(
			options.highlightSegments(),
			text.length
		)

		const startIndex = Math.max(0, options.columnStart() ?? 0)
		const endIndex = options.columnEnd() ?? text.length

		return buildTextRuns(text, depthMap, highlights, startIndex, endIndex)
	})

	return runs
}
