import type { EditorProps } from '../types'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
import { TextEditorView } from './TextEditorView'

export const Editor = (props: EditorProps) => {
	console.log('[Editor] render', {
		filePath: props.document.filePath(),
		contentLength: props.document.content()?.length,
		hasPrecomputedLineStarts: !!props.precomputedLineStarts,
		precomputedValue: props.precomputedLineStarts?.()?.length,
	})
	return (
		<CursorProvider
			filePath={props.document.filePath}
			isFileSelected={props.isFileSelected}
			content={props.document.content}
			pieceTable={props.document.pieceTable}
			precomputedLineStarts={props.precomputedLineStarts}
		>
			<HistoryProvider document={props.document}>
				<TextEditorView {...props} />
			</HistoryProvider>
		</CursorProvider>
	)
}
