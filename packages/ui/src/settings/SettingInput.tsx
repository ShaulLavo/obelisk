import type { Component } from 'solid-js'
import * as TextField from '@kobalte/core/text-field'
import { cn } from '../utils'

export type SettingInputProps = {
	value: string | number
	type: 'text' | 'number'
	onChange: (value: string | number) => void
	label: string
	description?: string
	placeholder?: string
	class?: string
}

export const SettingInput: Component<SettingInputProps> = (props) => {
	const handleChange = (value: string) => {
		if (props.type === 'number') {
			const numValue = parseFloat(value)
			props.onChange(isNaN(numValue) ? 0 : numValue)
		} else {
			props.onChange(value)
		}
	}

	return (
		<div class={cn('space-y-1', props.class)}>
			<TextField.Root value={String(props.value)} onChange={handleChange}>
				<TextField.Label class="text-ui font-medium text-foreground">
					{props.label}
				</TextField.Label>
				{props.description && (
					<TextField.Description class="text-ui-sm text-muted-foreground">
						{props.description}
					</TextField.Description>
				)}
				<TextField.Input
					type={props.type}
					placeholder={props.placeholder}
					class={cn(
						'flex h-8 w-full rounded-sm border border-border/60 bg-background px-2 py-1 text-ui',
						'ring-offset-background file:border-0 file:bg-transparent file:text-ui file:font-medium',
						'placeholder:text-muted-foreground',
						'focus-visible:outline-none focus-visible:border-foreground/40',
						'disabled:cursor-not-allowed disabled:opacity-50'
					)}
				/>
				<TextField.ErrorMessage class="text-ui-sm text-destructive" />
			</TextField.Root>
		</div>
	)
}
