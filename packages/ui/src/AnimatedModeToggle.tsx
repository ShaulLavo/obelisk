import { ThemeMode, useTheme } from '@repo/theme'
import { ModeToggle, type ModeToggleProps } from './ModeToggle'

const ANIMATION_DURATION = 400

export type AnimatedModeToggleProps = Omit<ModeToggleProps, 'onClick' | 'ref'>

export const AnimatedModeToggle = (props: AnimatedModeToggleProps) => {
	const { mode, setMode } = useTheme()
	let buttonRef: HTMLButtonElement | undefined

	const handleClick = async () => {
		if (!buttonRef) return

		if (!document.startViewTransition) {
			const modes: ThemeMode[] = ['light', 'dark', 'system']
			const nextMode = modes[(modes.indexOf(mode()) + 1) % modes.length]
			setMode(nextMode!)
			return
		}

		document.documentElement.classList.add('theme-transitioning')
		const style = document.createElement('style')
		style.innerHTML = '* { transition: none !important; }'
		document.head.appendChild(style)

		const transition = document.startViewTransition(() => {
			const modes: ThemeMode[] = ['light', 'dark', 'system']
			const nextMode = modes[(modes.indexOf(mode()) + 1) % modes.length]
			setMode(nextMode!)
		})

		try {
			await transition.ready

			style.remove()

			const { top, left, width, height } = buttonRef.getBoundingClientRect()
			const x = left + width / 2
			const y = top + height / 2

			const maxRadius = Math.hypot(
				Math.max(left, window.innerWidth - left),
				Math.max(top, window.innerHeight - top)
			)

			document.documentElement.animate(
				{
					clipPath: [
						`circle(0px at ${x}px ${y}px)`,
						`circle(${maxRadius}px at ${x}px ${y}px)`,
					],
				},
				{
					duration: ANIMATION_DURATION,
					easing: 'ease-in-out',
					pseudoElement: '::view-transition-new(root)',
				}
			)

			await transition.finished
			document.documentElement.classList.remove('theme-transitioning')
		} catch {
			style.remove()
			document.documentElement.classList.remove('theme-transitioning')
		}
	}

	return (
		<ModeToggle
			ref={(el) => (buttonRef = el)}
			onClick={handleClick}
			class={props.class}
		/>
	)
}
