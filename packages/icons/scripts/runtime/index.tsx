import {
	JSX,
	createMemo,
	splitProps,
	createSignal,
	createEffect,
	onCleanup,
} from 'solid-js'
import { isServer, mergeProps, ssr } from 'solid-js/web'

type SVGSVGElementTags = JSX.SVGElementTags['svg']

export interface IconTree {
	a: SVGSVGElementTags
	c: string
}

export interface IconProps extends SVGSVGElementTags {
	size?: string | number
	color?: string
	title?: string
	style?: JSX.CSSProperties
}

export interface IconBaseProps extends IconProps {
	src: IconTree
}

export declare type IconTypes = (props: IconProps) => JSX.Element

export const CustomIcon = (props: IconBaseProps) =>
	IconTemplate(props.src, props)

export function IconTemplate(iconSrc: IconTree, props: IconProps): JSX.Element {
	const mergedProps = mergeProps(iconSrc.a, props) as IconBaseProps
	const [_, svgProps] = splitProps(mergedProps, ['src'])
	const escapeHtml = (str: string) =>
		str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

	const rawContent = createMemo(() =>
		props.title
			? `${iconSrc.c}<title>${escapeHtml(props.title)}</title>`
			: iconSrc.c
	)

	const [content, setContent] = createSignal('')
	// no idea why we need the effect but it doesn't work without it
	createEffect(() => setContent(rawContent()))

	onCleanup(() => {
		setContent('')
	})

	return (
		<svg
			stroke={iconSrc.a?.stroke}
			color={props.color || 'currentColor'}
			fill={props.color || 'currentColor'}
			stroke-width="0"
			style={{
				...props.style,
				overflow: 'visible',
			}}
			{...svgProps}
			height={props.size || '1em'}
			width={props.size || '1em'}
			xmlns="http://www.w3.org/2000/svg"
			innerHTML={content()}
		>
			{isServer ? (ssr(content()) as unknown as JSX.Element) : null}
		</svg>
	)
}
