import { createMemo } from 'solid-js'
import { getPieceTableText } from '@repo/utils'
import { textToLineEntries } from '../utils'
import { mergeLineSegments, toLineHighlightSegments } from '../utils/highlights'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
import { TextFileEditorInner } from './TextFileEditorInner'
import type {
	BracketDepthMap,
	LineEntry,
	LineHighlightSegment,
	TextFileEditorProps
} from '../types'

export const TextFileEditor = (props: TextFileEditorProps) => {
	const pieceTableText = createMemo(() => {
		const snapshot = props.document.pieceTable()
		if (snapshot) {
			return getPieceTableText(snapshot)
		}
		return props.document.content()
	})

	const lineEntries = createMemo<LineEntry[]>(() => {
		if (!props.isFileSelected()) return []
		return textToLineEntries(pieceTableText())
	})

	// Convert BracketInfo[] from tree-sitter to BracketDepthMap for components
	const bracketDepths = createMemo<BracketDepthMap | undefined>(() => {
		const brackets = props.brackets?.()
		if (!brackets || brackets.length === 0) return undefined
		const depthMap: BracketDepthMap = {}
		for (const bracket of brackets) {
			depthMap[bracket.index] = bracket.depth
		}
		return depthMap
	})

		const lineHighlights = createMemo<LineHighlightSegment[][]>(() => {
			if (!props.isFileSelected()) return []
			const entries = lineEntries()
			const captures = props.highlights?.()
			if (!captures?.length || !entries.length) return []
			return toLineHighlightSegments(entries, captures)
		})

		const errorHighlights = createMemo<LineHighlightSegment[][]>(() => {
			if (!props.isFileSelected()) return []
			const entries = lineEntries()
			const errors = props.errors?.()
			if (!errors?.length || !entries.length) return []

			const mapped = errors.map(e => ({
				startIndex: e.startIndex,
				endIndex: e.endIndex,
				scope: e.isMissing ? 'missing' : 'error'
			}))

			return toLineHighlightSegments(entries, mapped)
		})

		const getLineHighlights = (lineIndex: number) =>
			mergeLineSegments(
				lineHighlights()[lineIndex],
				errorHighlights()[lineIndex]
			)


		const documentLength = createMemo(() => pieceTableText().length)

	return (
		<CursorProvider
			filePath={() => props.document.filePath()}
			lineEntries={lineEntries}
			documentText={pieceTableText}
			documentLength={documentLength}
		>
			<HistoryProvider document={props.document}>
					<TextFileEditorInner
						{...props}
						bracketDepths={bracketDepths}
						getLineHighlights={getLineHighlights}
						folds={props.folds}
					/>
			</HistoryProvider>
		</CursorProvider>
	)
}
