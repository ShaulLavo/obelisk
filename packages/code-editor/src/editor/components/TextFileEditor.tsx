import { createMemo } from 'solid-js'
import { getPieceTableText } from '@repo/utils'
import { computeBracketDepths, textToLineEntries } from '../utils'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
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

	const bracketDepths = createMemo(() => {
		const stats = props.stats()
		const rules = stats?.language.rules
		return computeBracketDepths(pieceTableText(), {
			angleBrackets: rules?.angleBrackets,
			stringRules: rules?.strings
		})
	})

	const documentLength = createMemo(() => pieceTableText().length)

	return (
		<CursorProvider
			filePath={() => props.document.filePath()}
			lineEntries={lineEntries}
			documentText={pieceTableText}
			documentLength={documentLength}
		>
			<HistoryProvider document={props.document}>
				<TextFileEditorInner {...props} bracketDepths={bracketDepths} />
			</HistoryProvider>
		</CursorProvider>
	)
}
