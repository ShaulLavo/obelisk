import { VsClose } from '@repo/icons/vs/VsClose'

type TabProps = {
	value: string
	label: string
	isActive?: boolean
	onSelect?: (value: string) => void
	onClose?: (value: string) => void
	title?: string
}

export const Tab = (props: TabProps) => {
	const handleSelect = () => {
		props.onSelect?.(props.value)
	}

	const handleClose = (e: MouseEvent) => {
		e.stopPropagation()
		props.onClose?.(props.value)
	}

	return (
		<button
			type="button"
			role="tab"
			tabIndex={props.isActive ? 0 : -1}
			onClick={handleSelect}
			title={props.title ?? props.value}
			class={
				'flex items-center gap-2 px-3 py-1 font-semibold transition-colors group ' +
				(props.isActive
					? 'bg-background text-foreground'
					: 'text-muted-foreground hover:text-foreground')
			}
			aria-selected={props.isActive}
		>
			<span class="max-w-48 truncate">{props.label}</span>
			{props.onClose && (
				<button
					type="button"
					onClick={handleClose}
					class="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
					title={`Close ${props.label}`}
				>
					<VsClose class="h-3 w-3" />
				</button>
			)}
		</button>
	)
}
