import { type Component, type JSX, mergeProps, splitProps } from 'solid-js'
import { clsx } from 'clsx'
import './auto-hide.css'

export const enum AutoHideVisibility {
	SHOW = 'show',
	HIDE = 'hide',
	AUTO = 'auto',
}

export interface AutoHideWrapperProps extends JSX.HTMLAttributes<HTMLDivElement> {
	visibility: AutoHideVisibility
}

export const AutoHideWrapper: Component<AutoHideWrapperProps> = (props) => {
	const merged = mergeProps(
		{
			visibility: AutoHideVisibility.AUTO,
		},
		props
	)

	const [localProps, restProps] = splitProps(merged, ['onWheel', 'class'])

	const wheelHandler = () => {
		const handler = localProps.onWheel
		if (!handler) return undefined
		return {
			passive: false,
			handleEvent: (e: WheelEvent) => {
				if (typeof handler === 'function') {
					// @ts-expect-error - event type mismatch in Solid on:wheel
					handler(e)
				}
			},
		}
	}

	return (
		<div
			class={clsx('auto-hide-wrapper', localProps.class)}
			data-visibility={restProps.visibility}
			// eslint-disable-next-line solid/reactivity -- wheelHandler reads reactive localProps.onWheel intentionally
			on:wheel={wheelHandler()}
			{...restProps}
		>
			<div class="auto-hide-content">{restProps.children}</div>
		</div>
	)
}
