import type { Component } from 'solid-js'
import * as CheckboxPrimitive from '@kobalte/core/checkbox'
import { Checkbox } from '../checkbox'
import { cn } from '../utils'

export type SettingCheckboxProps = {
	checked: boolean
	onChange: (checked: boolean) => void
	label: string
	description?: string
	class?: string
}

export const SettingCheckbox: Component<SettingCheckboxProps> = (props) => {
	return (
		<div class={cn('space-y-1', props.class)}>
			<Checkbox
				checked={props.checked}
				onChange={props.onChange}
				class="items-start"
			>
				<div class="ml-2 space-y-1">
					<CheckboxPrimitive.Label class="text-ui font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
						{props.label}
					</CheckboxPrimitive.Label>
					{props.description && (
						<CheckboxPrimitive.Description class="text-ui-sm text-muted-foreground">
							{props.description}
						</CheckboxPrimitive.Description>
					)}
				</div>
			</Checkbox>
		</div>
	)
}
