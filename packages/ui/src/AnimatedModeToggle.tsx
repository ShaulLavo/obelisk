import { useTheme } from '@repo/theme'
import { viewTransition } from '@repo/utils'
import { ModeToggle, type ModeToggleProps } from './ModeToggle'

export type AnimatedModeToggleProps = Omit<ModeToggleProps, 'onClick' | 'ref'>

export const AnimatedModeToggle = (props: AnimatedModeToggleProps) => {
	const { isDark, setMode } = useTheme()

	const handleClick = () => {
		viewTransition(() => {
			setMode(isDark() ? 'light' : 'dark')
		})
	}

	return <ModeToggle onClick={handleClick} class={props.class} />
}
