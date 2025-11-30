import { createMemo } from 'solid-js'
import { useFs } from '~/fs/context/FsContext'
import type { FsSource } from '~/fs/types'
import { formatBytes } from '~/utils/bytes'

const SOURCE_LABELS: Record<FsSource, string> = {
	local: 'Local Folder',
	opfs: 'Browser Storage (OPFS)',
	memory: 'In-Memory'
}

export const StatusBar = () => {
	const [state] = useFs()

	const filePath = createMemo(() => state.selectedPath ?? 'No file selected')

	const sizeLabel = createMemo(() => {
		if (!state.selectedPath) return '--'
		return state.selectedFileSize !== undefined
			? formatBytes(state.selectedFileSize)
			: 'calculating...'
	})

	const statusIndicator = createMemo(() => {
		if (state.error) {
			return {
				label: state.error,
				class:
					'border-red-900/60 bg-red-900/30 text-red-200 shadow-[0_0_10px_rgba(248,113,113,0.2)]'
			}
		}
		if (state.loading) {
			return {
				label: 'Loading filesystem...',
				class: 'border-amber-500/40 bg-amber-500/10 text-amber-200'
			}
		}
		return {
			label: state.selectedPath ? 'Ready' : 'Idle',
			class: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
		}
	})

	return (
		<div class="rounded-lg border border-zinc-800/70 bg-zinc-950/70 px-4 py-2 text-[12px] text-zinc-200 shadow-inner">
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<span class="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
						File
					</span>
					<span class="truncate font-mono text-sm text-zinc-100">
						{filePath()}
					</span>
				</div>

				<div class="flex items-center gap-2 text-sm">
					<span class="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
						Size
					</span>
					<span class="font-semibold text-zinc-100">{sizeLabel()}</span>
				</div>

				<div class="flex items-center gap-2 text-sm">
					<span class="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
						Source
					</span>
					<span class="font-semibold text-zinc-100">
						{SOURCE_LABELS[state.activeSource]}
					</span>
				</div>

				<div class="flex items-center gap-2 text-sm">
					<span class="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
						Status
					</span>
					<span
						class={`rounded border px-2 py-0.5 text-[11px] font-semibold ${statusIndicator().class}`}
					>
						{statusIndicator().label}
					</span>
				</div>
			</div>
		</div>
	)
}
