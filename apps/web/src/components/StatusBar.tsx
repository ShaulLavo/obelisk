import { createMemo, Show } from 'solid-js'
import { useFs } from '~/fs/context/FsContext'
import type { FsSource } from '~/fs/types'
import { formatBytes } from '@repo/utils'
import { useFocusManager, type FocusArea } from '~/focus/focusManager'
import { AnimatedModeToggle } from '@repo/ui/AnimatedModeToggle'

const SOURCE_LABELS: Record<FsSource, string> = {
	local: 'Local Folder',
	opfs: 'Browser Storage (OPFS)',
	memory: 'In-Memory',
}

const FOCUS_LABELS: Record<FocusArea, string> = {
	global: 'Global',
	editor: 'Editor',
	terminal: 'Terminal',
	fileTree: 'File Tree',
}

export const StatusBar = () => {
	const [state] = useFs()
	const focus = useFocusManager()

	const filePath = createMemo(() => state.selectedPath ?? 'No file selected')

	const sizeLabel = createMemo(() => {
		if (!state.selectedPath) return '--'
		return state.selectedFileSize !== undefined
			? formatBytes(state.selectedFileSize)
			: 'calculating...'
	})

	const badgeClass = 'border-border/40 bg-muted text-muted-foreground'

	const statusIndicator = createMemo(() => ({
		label: state.loading
			? 'Loading filesystem...'
			: state.selectedPath
				? 'Ready'
				: 'Idle',
		class: badgeClass,
	}))

	const focusDescriptor = createMemo(() => ({
		label: FOCUS_LABELS[focus.activeArea()] ?? 'Global',
		class: badgeClass,
	}))

	const backgroundIndicator = createMemo(() => {
		const indexedFileCount = state.backgroundIndexedFileCount

		if (state.backgroundPrefetching) {
			return {
				label: `Indexed ${indexedFileCount} files`,
				class: badgeClass,
				showSpinner: true,
			}
		}

		if (indexedFileCount > 0) {
			return {
				label: `Indexed ${indexedFileCount} files`,
				class: badgeClass,
				showSpinner: false,
			}
		}

		return undefined
	})

	return (
		<div class="z-20 border-t border-border/30 bg-muted px-3 py-1 text-foreground text-ui">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<div class="flex min-w-0 flex-1 items-center gap-1.5">
					<span class="uppercase tracking-[0.08em] text-muted-foreground text-ui-xs">
						File
					</span>
					<span class="truncate font-mono text-foreground">
						{filePath()}
					</span>
				</div>

				<div class="flex items-center gap-1.5">
					<span class="uppercase tracking-[0.08em] text-muted-foreground text-ui-xs">
						Size
					</span>
					<span class="font-semibold text-foreground">
						{sizeLabel()}
					</span>
				</div>

				<div class="flex items-center gap-1.5">
					<span class="uppercase tracking-[0.08em] text-muted-foreground text-ui-xs">
						Source
					</span>
					<span class="font-semibold text-foreground">
						{SOURCE_LABELS[state.activeSource]}
					</span>
				</div>

				<div class="flex items-center gap-1.5">
					<span class="uppercase tracking-[0.08em] text-muted-foreground text-ui-xs">
						Status
					</span>
					<span
						class={`rounded border px-1.5 py-0.5 font-semibold text-ui-xs ${statusIndicator().class}`}
					>
						{statusIndicator().label}
					</span>
				</div>

				<Show when={backgroundIndicator()}>
					{(indicator) => (
						<div class="flex items-center gap-1.5">
							<span class="uppercase tracking-[0.08em] text-muted-foreground text-ui-xs">
								Prefetch
							</span>
							<span
								class={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold text-ui-xs ${indicator().class}`}
							>
								<Show when={indicator().showSpinner}>
									<span
										aria-hidden="true"
										class="mr-1 h-2 w-2 animate-spin rounded-full border border-current border-t-transparent"
									/>
								</Show>
								{indicator().label}
							</span>
						</div>
					)}
				</Show>

				<div class="flex items-center gap-1.5">
					<span class="uppercase tracking-[0.08em] text-muted-foreground text-ui-xs">
						Focus
					</span>
					<span
						class={`rounded border px-1.5 py-0.5 font-semibold transition duration-150 text-ui-xs ${focusDescriptor().class}`}
					>
						{focusDescriptor().label}
					</span>
				</div>

				<AnimatedModeToggle />
			</div>
		</div>
	)
}
