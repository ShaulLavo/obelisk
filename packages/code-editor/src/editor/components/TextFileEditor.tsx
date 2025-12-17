import { createMemo } from 'solid-js'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
import { TextFileEditorInner } from './TextFileEditorInner'
import type { BracketDepthMap, TextFileEditorProps } from '../types'

export const TextFileEditor = (props: TextFileEditorProps) => {
	// Convert tree-sitter BracketInfo[] to BracketDepthMap
	const treeSitterBracketDepths = createMemo<BracketDepthMap | undefined>(
		() => {
			const brackets = props.brackets?.()
			if (!brackets || brackets.length === 0) return undefined
			const depthMap: BracketDepthMap = {}
			for (const bracket of brackets) {
				depthMap[bracket.index] = bracket.depth
			}
			return depthMap
		}
	)

	return (
		<CursorProvider
			filePath={props.document.filePath}
			isFileSelected={props.isFileSelected}
			content={props.document.content}
			pieceTable={props.document.pieceTable}
		>
			<HistoryProvider document={props.document}>
				<TextFileEditorInner
					{...props}
					treeSitterBracketDepths={treeSitterBracketDepths}
					folds={props.folds}
				/>
			</HistoryProvider>
		</CursorProvider>
	)
}
