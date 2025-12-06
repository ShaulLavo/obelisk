/* eslint-disable solid/reactivity */
import type { Accessor, JSX } from 'solid-js'
import type { TextEditorLayout } from '../hooks'

type InputProps = {
	inputRef: (element: HTMLTextAreaElement) => void
	layout: Pick<
		TextEditorLayout,
		'inputX' | 'inputY' | 'charWidth' | 'lineHeight'
	>
	isEditable: Accessor<boolean>
	onInput: JSX.EventHandlerUnion<HTMLTextAreaElement, InputEvent>
	onKeyDown: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent>
	onKeyUp: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent>
}

export const Input = (props: InputProps) => (
	<textarea
		ref={props.inputRef}
		class="absolute opacity-0"
		style={{
			left: `${props.layout.inputX()}px`,
			top: `${props.layout.inputY()}px`,
			width: `${props.layout.charWidth()}px`,
			height: `${props.layout.lineHeight()}px`
		}}
		autocomplete="off"
		autocorrect="off"
		spellcheck={false}
		disabled={!props.isEditable()}
		onInput={props.onInput}
		onKeyDown={props.onKeyDown}
		onKeyUp={props.onKeyUp}
	/>
)
