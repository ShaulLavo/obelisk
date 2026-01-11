import type { Component } from 'solid-js'
import { Label } from '../label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../select'
import { cn } from '../utils'

export type SettingSelectOption = {
	value: string
	label: string
}

export type SettingSelectProps = {
	value: string
	options: SettingSelectOption[]
	onChange: (value: string) => void
	label: string
	description?: string
	class?: string
}

export const SettingSelect: Component<SettingSelectProps> = (props) => {
	const selectedOption = () =>
		props.options.find((o) => o.value === props.value)

	return (
		<div class={cn('space-y-1', props.class)}>
			<Label class="text-ui">{props.label}</Label>
			{props.description && (
				<p class="text-ui-sm text-muted-foreground">{props.description}</p>
			)}
			<Select
				value={selectedOption()}
				onChange={(val) => val && props.onChange(val.value)}
				options={props.options}
				optionValue="value"
				optionTextValue="label"
				itemComponent={(props) => (
					<SelectItem
						item={props.item}
						class="focus:bg-foreground/5 focus:text-foreground"
					>
						{props.item.rawValue.label}
					</SelectItem>
				)}
			>
				<SelectTrigger class="h-8 py-1 focus:ring-0 focus:ring-offset-0 border-border/60">
					<SelectValue<SettingSelectOption>>
						{(state) => state.selectedOption()?.label}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>
		</div>
	)
}
