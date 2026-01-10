import type { Component, JSX } from 'solid-js'
import { Match, Switch } from 'solid-js'
import { SettingCheckbox } from './SettingCheckbox'
import { SettingSelect } from './SettingSelect'
import { SettingInput } from './SettingInput'
import { cn } from '../utils'

export type SettingDefinition = {
	id: string
	key: string
	default: unknown
	description?: string
	options?: string[] | { value: string; label: string }[]
	experimental?: boolean
}

export type SettingItemProps = {
	setting: SettingDefinition
	value: unknown
	onChange: (value: unknown) => void
	class?: string
	customComponents?: Record<string, () => JSX.Element>
}

export const SettingItem: Component<SettingItemProps> = (props) => {
	// Check if there's a custom component for this setting
	const customComponent = () => props.customComponents?.[props.setting.key]

	// Infer type from default value
	const inferredType = () => {
		const defaultVal = props.setting.default
		if (typeof defaultVal === 'boolean') return 'boolean'
		if (typeof defaultVal === 'number') return 'number'
		return 'string'
	}

	// Normalize options to { value, label } format
	const normalizedOptions = () => {
		const opts = props.setting.options
		if (!opts) return undefined
		return opts.map((opt) =>
			typeof opt === 'string' ? { value: opt, label: opt } : opt
		)
	}

	return (
		<div class={cn('py-2.5', props.class)}>
			<Switch>
				<Match when={customComponent()}>{customComponent()!()}</Match>

				<Match when={inferredType() === 'boolean'}>
					<SettingCheckbox
						checked={Boolean(props.value)}
						onChange={(checked) => props.onChange(checked)}
						label={props.setting.id}
						description={props.setting.description || ''}
					/>
				</Match>

				<Match when={normalizedOptions()}>
					<SettingSelect
						value={String(props.value ?? props.setting.default ?? '')}
						options={normalizedOptions()!}
						onChange={(value) => props.onChange(value)}
						label={props.setting.id}
						description={props.setting.description || ''}
					/>
				</Match>

				<Match when={inferredType() === 'string' && !normalizedOptions()}>
					<SettingInput
						value={String(props.value ?? props.setting.default ?? '')}
						type="text"
						onChange={(value) => props.onChange(value)}
						label={props.setting.id}
						description={props.setting.description || ''}
					/>
				</Match>

				<Match when={inferredType() === 'number'}>
					<SettingInput
						value={Number(props.value ?? props.setting.default ?? 0)}
						type="number"
						onChange={(value) => props.onChange(value)}
						label={props.setting.id}
						description={props.setting.description || ''}
					/>
				</Match>
			</Switch>
		</div>
	)
}
