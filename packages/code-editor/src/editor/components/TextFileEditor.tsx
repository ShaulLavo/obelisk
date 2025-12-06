import { createMemo } from 'solid-js'
import { getPieceTableText } from '@repo/utils'
import { textToLineEntries } from '../utils'
import { CursorProvider } from '../cursor'
import { TextFileEditorInner } from './TextFileEditorInner'
import type { LineEntry, TextFileEditorProps } from '../types'

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

	const documentLength = createMemo(() => pieceTableText().length)

	return (
		<CursorProvider
			filePath={() => props.document.filePath()}
			lineEntries={lineEntries}
			documentText={pieceTableText}
			documentLength={documentLength}
		>
			<TextFileEditorInner {...props} />
		</CursorProvider>
	)
}
