import type { JSX } from 'solid-js'
import { createEffect, on, splitProps } from 'solid-js'

import { cn } from '@repo/ui/utils'
import {
	DEFAULT_LINE_HEIGHT_RATIO,
	useEditorViewportState
} from './editorViewportState'

type TextAreaAttrs = Omit<
	JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
	'value' | 'style' | 'ref' | 'onInput'
>

export interface InputProps extends TextAreaAttrs {
	content: string
	onInput: (content: string) => void
	tabSize: number
	isPlainMode?: boolean
	fontSize?: number
	fontFamily?: string
}

export const Input = (props: InputProps) => {
	const { syncFontMetricsFromElement } = useEditorViewportState()
	const [local, others] = splitProps(props, [
		'class',
		'isPlainMode',
		'tabSize',
		'onInput',
		'content',
		'fontSize',
		'fontFamily'
	])

	let textareaRef: HTMLTextAreaElement | undefined

	const handleInput: JSX.EventHandlerUnion<
		HTMLTextAreaElement,
		InputEvent
	> = event => {
		local.onInput(event.currentTarget.value)
	}

	const updateTypography = () => {
		if (!textareaRef) return

		if (local.fontSize) {
			const computedLineHeight =
				Math.round(local.fontSize * DEFAULT_LINE_HEIGHT_RATIO * 100) / 100
			textareaRef.style.fontSize = `${local.fontSize}px`
			textareaRef.style.lineHeight = `${computedLineHeight}px`
		} else {
			textareaRef.style.removeProperty('font-size')
			textareaRef.style.removeProperty('line-height')
		}

		if (local.fontFamily) {
			textareaRef.style.fontFamily = local.fontFamily
		} else {
			textareaRef.style.removeProperty('font-family')
		}

		syncFontMetricsFromElement(textareaRef)
	}

	createEffect(
		on([() => local.fontSize, () => local.fontFamily], updateTypography)
	)

	return (
		<textarea
			ref={el => {
				textareaRef = el
				updateTypography()
			}}
			onInput={handleInput}
			value={local.content}
			class={cn(
				'flex-1 min-h-0 w-full resize-none focus:outline-none focus-visible:outline-none',
				local.isPlainMode && 'input-layer--plain', // TODO impl plain
				local.class
			)}
			style={{ 'tab-size': local.tabSize, 'white-space': 'pre' }}
			spellcheck={false}
			autocapitalize="off"
			autocomplete="off"
			autocorrect="off"
			aria-label="Code editor input"
			{...others}
		/>
	)
}
