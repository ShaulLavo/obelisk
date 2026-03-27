import { useTheme } from '@repo/theme'
import { FiMoon, FiSun } from '@repo/icons/fi'
import type { JSX } from 'solid-js'

export type ModeToggleProps = {
	ref?: (el: HTMLButtonElement) => void
	onClick?: () => void
	class?: string
}

export const ModeToggle = (props: ModeToggleProps) => {
	const { setMode, isDark } = useTheme()

	const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = () => {
		if (props.onClick) {
			props.onClick()
		} else {
			setMode(isDark() ? 'light' : 'dark')
		}
	}

	return (
		<button
			ref={props.ref}
			onClick={handleClick}
			class={
				props.class ??
				'ml-auto flex items-center gap-1.5 rounded border border-border/30 bg-background px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-foreground transition hover:opacity-80'
			}
		>
			{isDark() ? <FiMoon class="h-3 w-3" /> : <FiSun class="h-3 w-3" />}
			{isDark() ? 'dark' : 'light'}
		</button>
	)
}
