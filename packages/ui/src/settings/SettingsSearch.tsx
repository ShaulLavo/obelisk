import type { Component } from 'solid-js'
import { VsSearch } from '@repo/icons/vs/VsSearch'
import { cn } from '../utils'

export type SettingsSearchProps = {
	value?: string
	onInput?: (value: string) => void
	placeholder?: string
	class?: string
}

export const SettingsSearch: Component<SettingsSearchProps> = (props) => {
	const handleInput = (event: Event) => {
		const target = event.target as HTMLInputElement
		props.onInput?.(target.value)
	}

	return (
		<div class={cn('relative w-full', props.class)}>
			<div class="relative">
				<input
					type="text"
					value={props.value || ''}
					onInput={handleInput}
					placeholder={props.placeholder || 'Search settings'}
					class={cn(
						'w-full h-8 px-2.5 pr-8 text-ui',
						'bg-background border border-border/60 rounded-sm',
						'placeholder:text-muted-foreground',
						'focus-visible:outline-none focus-visible:border-foreground/40',
						'transition-colors duration-200'
					)}
				/>
				<div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
					<VsSearch class="w-4 h-4 text-muted-foreground" />
				</div>
			</div>
		</div>
	)
}
