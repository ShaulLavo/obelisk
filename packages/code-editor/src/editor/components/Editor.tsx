import type { EditorProps } from '../types'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
import { TextEditorView } from './TextEditorView'
import { splitProps } from 'solid-js'

export const Editor = (props: EditorProps) => {
	// Split props to ensure callbacks are passed correctly through SolidJS reactivity
	const [callbacks, otherProps] = splitProps(props, [
		'onScrollPositionChange',
		'onCursorPositionChange',
		'onSelectionsChange',
		'onCaptureVisibleContent',
		'onSave',
		'onEditBlocked',
	])

	return (
		<CursorProvider
			filePath={props.document.filePath}
			isFileSelected={props.isFileSelected}
			content={props.document.content}
			pieceTable={props.document.pieceTable}
			precomputedLineStarts={props.precomputedLineStarts}
			contentVersion={props.contentVersion}
		>
			<HistoryProvider document={props.document}>
				<TextEditorView
					{...otherProps}
					onScrollPositionChange={callbacks.onScrollPositionChange}
					onCursorPositionChange={callbacks.onCursorPositionChange}
					onSelectionsChange={callbacks.onSelectionsChange}
					onCaptureVisibleContent={callbacks.onCaptureVisibleContent}
					onSave={callbacks.onSave}
					onEditBlocked={callbacks.onEditBlocked}
				/>
			</HistoryProvider>
		</CursorProvider>
	)
}
