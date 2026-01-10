import { VsClose } from '@repo/icons/vs/VsClose'
import { VsCircleFilled } from '@repo/icons/vs/VsCircleFilled'
import { createSignal, Show } from 'solid-js'
import { FileIcon } from './FileIcon'
import type { ViewMode } from '../types/TabIdentity'
import { Button } from '@repo/ui/button'

type TabProps = {
	value: string
	label: string
	isActive?: boolean
	isDirty?: boolean
	onSelect?: (value: string) => void
	onClose?: (value: string) => void
	title?: string
	viewMode?: ViewMode
	availableViewModes?: ViewMode[]
}

export const Tab = (props: TabProps) => {
	const [isHovering, setIsHovering] = createSignal(false)

	const handleSelect = () => {
		props.onSelect?.(props.value)
	}

	const handleClose = (e: MouseEvent) => {
		e.stopPropagation()
		props.onClose?.(props.value)
	}

	// Determine if we should show view mode indicator (Requirements 8.1, 8.2, 8.3)
	const shouldShowViewModeIndicator = () => {
		return (
			props.viewMode &&
			props.availableViewModes &&
			props.availableViewModes.length > 1 &&
			props.viewMode !== 'editor'
		)
	}

	// Get view mode indicator styling
	const getViewModeIndicatorClass = () => {
		const baseClass =
			'inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-sm'

		switch (props.viewMode) {
			case 'ui':
				return `${baseClass} bg-blue-500/20 text-blue-400 border border-blue-500/30`
			case 'binary':
				return `${baseClass} bg-orange-500/20 text-orange-400 border border-orange-500/30`
			default:
				return `${baseClass} bg-gray-500/20 text-gray-400 border border-gray-500/30`
		}
	}

	// Get view mode indicator text
	const getViewModeIndicatorText = () => {
		switch (props.viewMode) {
			case 'ui':
				return 'UI'
			case 'binary':
				return 'BIN'
			default:
				return props.viewMode?.toUpperCase().slice(0, 3) || ''
		}
	}

	return (
		<Button
			variant="ghost"
			role="tab"
			tabIndex={props.isActive ? 0 : -1}
			onClick={handleSelect}
			title={props.title ?? props.value}
			class={
				'h-auto gap-2 px-3 py-1 font-semibold transition-colors group text-xs rounded-none border-r border-border/30 first:border-l ' +
				'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus:outline-none ring-0 outline-none ' +
				'hover:bg-muted/50 hover:text-foreground ' + // Override accent hover with neutral muted
				(props.isActive
					? 'bg-background text-foreground'
					: 'text-muted-foreground')
			}
			aria-selected={props.isActive}
		>
			<FileIcon name={props.label} size={14} class="shrink-0" />
			<span class="max-w-48 truncate">{props.label}</span>

			{/* View mode indicator (Requirements 8.1, 8.2, 8.3) */}
			<Show when={shouldShowViewModeIndicator()}>
				<span
					class={getViewModeIndicatorClass()}
					title={`${getViewModeIndicatorText()} mode`}
				>
					{getViewModeIndicatorText()}
				</span>
			</Show>

			{props.onClose && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={handleClose}
					onMouseEnter={() => setIsHovering(true)}
					onMouseLeave={() => setIsHovering(false)}
					class={
						'h-4 w-4 hover:bg-muted rounded p-0.5 transition-opacity ' +
						(props.isDirty
							? 'opacity-100'
							: 'opacity-0 group-hover:opacity-100')
					}
					title={`Close ${props.label}`}
				>
					<Show
						when={props.isDirty && !isHovering()}
						fallback={<VsClose class="h-3 w-3" />}
					>
						<VsCircleFilled class="h-2.5 w-2.5" />
					</Show>
				</Button>
			)}
		</Button>
	)
}
