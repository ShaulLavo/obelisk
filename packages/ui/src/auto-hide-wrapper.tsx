import { type Component, type JSX, mergeProps, splitProps } from 'solid-js'
import { clsx } from 'clsx'

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

	// Split out onWheel to handle it with { passive: false } via on:wheel syntax
	// Also split out 'class' to prevent it from overwriting our clsx-built class
	const [localProps, restProps] = splitProps(merged, ['onWheel', 'class'])

	// Create handler with passive:false to allow preventDefault() without browser warnings
	const wheelHandler = () => {
		const handler = localProps.onWheel
		if (!handler) return undefined
		return {
			passive: false,
			handleEvent: (e: WheelEvent) => {
				if (typeof handler === 'function') {
					handler(e)
				}
			},
		}
	}

	return (
		<div
			class={clsx(
				'transition-opacity duration-300',
				{
					// SHOW: Always visible
					'opacity-100': restProps.visibility === 'show',

					// HIDE: Hidden and no pointer events
					'opacity-0 pointer-events-none': restProps.visibility === 'hide',

					// AUTO: Hidden by default, visible on hover (including hit zone)
					'opacity-0 hover:opacity-100': restProps.visibility === 'auto',
				},
				localProps.class
			)}
			on:wheel={wheelHandler()}
			{...restProps}
		>
			{restProps.children}
		</div>
	)
}
