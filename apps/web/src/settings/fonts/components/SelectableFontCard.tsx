import { Checkbox } from '@repo/ui/checkbox'
import { FontCard, type FontCardProps } from './FontCard'

export interface SelectableFontCardProps extends FontCardProps {
	isSelected: boolean
	isSelectMode: boolean
	onToggle: () => void
}

export const SelectableFontCard = (props: SelectableFontCardProps) => {
	return (
		<div class="relative group">
			<div
				class="relative transition-transform duration-200"
				classList={{
					'scale-[0.98]': props.isSelected,
					'cursor-pointer': props.isSelectMode,
				}}
				onClick={(e) => {
					if (props.isSelectMode) {
						e.preventDefault()
						e.stopPropagation()
						props.onToggle()
					}
				}}
			>
				<FontCard {...props} />

				<div
					class="absolute inset-0 rounded-lg border-2 pointer-events-none transition-colors"
					classList={{
						'border-primary bg-primary/5': props.isSelected,
						'border-transparent': !props.isSelected,
					}}
				/>
			</div>

			<div class="absolute top-2 right-2 z-10">
				<Checkbox
					checked={props.isSelected}
					onChange={() => props.onToggle()}
					class={`w-6 h-6 border shadow-sm transition-all duration-200 bg-background/80 backdrop-blur ${
						props.isSelectMode || props.isSelected
							? 'opacity-100'
							: 'opacity-0 group-hover:opacity-100'
					}`}
				/>
			</div>
		</div>
	)
}
