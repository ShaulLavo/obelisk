import { createContext, useContext } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'

export type EditorViewportStateValue = {
	fontSize: Accessor<number>
	setFontSize: Setter<number>
	fontFamily: Accessor<string>
	setFontFamily: Setter<string>
	lineHeight: Accessor<number>
	charWidth: Accessor<number>
	syncFontMetricsFromElement: (el: HTMLElement) => void
}

export const EditorViewportStateContext =
	createContext<EditorViewportStateValue>()

export const useEditorViewportState = () => {
	const ctx = useContext(EditorViewportStateContext)
	if (!ctx) {
		throw new Error(
			'useEditorViewportState must be used within an EditorViewportStateProvider'
		)
	}
	return ctx
}
