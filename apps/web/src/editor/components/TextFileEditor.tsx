import { createMemo } from 'solid-js'
import { useFs } from '../../fs/context/FsContext'
import { getPieceTableText } from '@repo/utils/pieceTable'
import { textToLineEntries } from '../utils'
import { CursorProvider } from '../cursor'
import { TextFileEditorInner } from './TextFileEditorInner'
import type { LineEntry, TextFileEditorProps } from '../types'

export const TextFileEditor = (props: TextFileEditorProps) => {
	const [state] = useFs()

	const pieceTableText = createMemo(() => {
		const snapshot = state.selectedFilePieceTable
		if (snapshot) {
			return getPieceTableText(snapshot)
		}
		const stats = props.stats()
		return stats?.text ?? ''
	})

	const lineEntries = createMemo<LineEntry[]>(() => {
		if (!props.isFileSelected()) return []
		return textToLineEntries(pieceTableText())
	})

	const documentLength = createMemo(() => pieceTableText().length)

	return (
		<CursorProvider
			filePath={() => state.lastKnownFilePath}
			lineEntries={lineEntries}
			documentText={pieceTableText}
			documentLength={documentLength}
		>
			<TextFileEditorInner {...props} />
		</CursorProvider>
	)
}
