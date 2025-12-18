import type { EditorProps } from '../types'
import { createMemo } from 'solid-js'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
import { TextEditorView } from './TextEditorView'
import type { BracketDepthMap } from '../types'

export const Editor = (props: EditorProps) => {
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
				<TextEditorView
					{...props}
					treeSitterBracketDepths={treeSitterBracketDepths}
				/>
			</HistoryProvider>
		</CursorProvider>
	)
}
