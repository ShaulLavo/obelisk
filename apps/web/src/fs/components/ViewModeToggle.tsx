import { Component, For, Show } from 'solid-js'
import { VsEdit } from '@repo/icons/vs/VsEdit'
import { VsSettingsGear } from '@repo/icons/vs/VsSettingsGear'
import { VsFileBinary } from '@repo/icons/vs/VsFileBinary'
import type { ViewMode } from '../types/TabIdentity'
import type { ViewModeDefinition } from '../registry/ViewModeRegistry'

type ViewModeToggleProps = {
	currentPath: string
	currentViewMode: ViewMode
	availableModes: ViewModeDefinition[]
	onModeSelect: (mode: ViewMode) => void
}

const getViewModeIcon = (mode: ViewMode) => {
	switch (mode) {
		case 'editor':
			return VsEdit
		case 'ui':
			return VsSettingsGear
		case 'binary':
			return VsFileBinary
		default:
			return VsEdit
	}
}

export const ViewModeToggle: Component<ViewModeToggleProps> = (props) => {
	// Only show toggle if more than one mode is available
	const shouldShow = () => props.availableModes.length > 1

	const handleModeSelect = (mode: ViewMode) => {
		if (mode !== props.currentViewMode) {
			props.onModeSelect(mode)
		}
	}

	return (
		<Show when={shouldShow()}>
			<div class="flex items-center gap-1 px-2 py-1 border-l border-border/30">
				<For each={props.availableModes}>
					{(mode) => {
						const Icon = getViewModeIcon(mode.id)
						const isActive = () => mode.id === props.currentViewMode

						return (
							<button
								type="button"
								onClick={() => handleModeSelect(mode.id)}
								title={`Switch to ${mode.label} view`}
								class={
									'flex items-center justify-center w-6 h-6 rounded text-xs transition-colors ' +
									(isActive()
										? 'bg-accent text-accent-foreground'
										: 'text-muted-foreground hover:text-foreground hover:bg-muted')
								}
								aria-pressed={isActive()}
								aria-label={`Switch to ${mode.label} view`}
							>
								<Icon class="w-3.5 h-3.5" />
							</button>
						)
					}}
				</For>
			</div>
		</Show>
	)
}
