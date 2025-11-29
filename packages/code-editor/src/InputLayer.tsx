import type { JSX } from 'solid-js'
import { createEffect, on, splitProps } from 'solid-js'

import { cn } from './utils'

type TextAreaAttrs = Omit<
	JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
	'value' | 'style' | 'ref' | 'onInput'
>

export interface InputLayerProps extends TextAreaAttrs {
	content: string
	onInput: (content: string) => void
	tabSize: number
	bufferId?: string
	isPlainMode?: boolean
}

export const InputLayer = (props: InputLayerProps) => {
	const [local, others] = splitProps(props, [
		'class',
		'isPlainMode',
		'tabSize',
		'onInput',
		'content',
		'bufferId'
	])

	let textareaRef: HTMLTextAreaElement | undefined

	const handleInput: JSX.EventHandlerUnion<
		HTMLTextAreaElement,
		InputEvent
	> = event => {
		local.onInput(event.currentTarget.value)
	}

	createEffect(
		on(
			() => local.bufferId,
			() => {
				if (!textareaRef) return
				if (textareaRef.value !== local.content) {
					textareaRef.value = local.content
				}
			}
		)
	)

	return (
		<textarea
			ref={el => {
				textareaRef = el
				textareaRef.value = local.content
			}}
			onInput={handleInput}
			class={cn(
				'input-layer editor-textarea editor-viewport',
				local.isPlainMode && 'input-layer--plain',
				local.class
			)}
			style={{ 'tab-size': local.tabSize }}
			spellcheck={false}
			autocapitalize="off"
			autocomplete="off"
			autocorrect="off"
			aria-label="Code editor input"
			{...others}
		/>
	)
}
