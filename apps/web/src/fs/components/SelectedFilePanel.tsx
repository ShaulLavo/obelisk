import type { JSX } from 'solid-js'
import {
	Accessor,
	For,
	Match,
	Switch,
	createMemo,
	createSignal
} from 'solid-js'
import { useFs } from '../../fs/context/FsContext'
import { Editor } from '../../editor'
import type { CursorMode } from '../../editor/types'
import { BinaryFileViewer } from '../../components/BinaryFileViewer'
import { makePersisted } from '@solid-primitives/storage'

const FONT_OPTIONS = [
	{
		label: 'JetBrains Mono',
		value: '"JetBrains Mono Variable", monospace'
	},
	{
		label: 'Geist Mono',
		value: '"Geist Mono", monospace'
	}
]
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0]?.value ?? 'monospace'

type SelectedFilePanelProps = {
	isFileSelected: Accessor<boolean>
	currentPath?: string
}

export const SelectedFilePanel = (props: SelectedFilePanelProps) => {
	const [state] = useFs()
	const [fontSize, setFontSize] = createSignal(DEFAULT_FONT_SIZE)
	const [fontFamily, setFontFamily] = createSignal(DEFAULT_FONT_FAMILY)
	const [cursorMode, setCursorMode] = makePersisted(
		// eslint-disable-next-line solid/reactivity
		createSignal<CursorMode>('regular'),
		{ name: 'editor-cursor-mode' }
	)

	const isBinary = () => state.selectedFileStats?.contentKind === 'binary'

	const handleFontSizeInput: JSX.EventHandlerUnion<
		HTMLInputElement,
		InputEvent
	> = event => {
		const next = event.currentTarget.valueAsNumber
		setFontSize(Number.isNaN(next) ? DEFAULT_FONT_SIZE : next)
	}

	const resetFontControls = () => {
		setFontSize(DEFAULT_FONT_SIZE)
		setFontFamily(DEFAULT_FONT_FAMILY)
	}

	const toggleCursorMode = () => {
		setCursorMode(mode => (mode === 'regular' ? 'terminal' : 'regular'))
	}

	const cursorModeLabel = createMemo(() =>
		cursorMode() === 'terminal' ? 'Terminal' : 'Regular'
	)

	const currentFileLabel = createMemo(() => {
		const path = props.currentPath
		if (!path) return 'No file selected'
		return path.split('/').pop() || 'No file selected'
	})

	return (
		<div class="flex h-full flex-col font-mono overflow-hidden">
			<p class="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
				{currentFileLabel()}
			</p>

			<div class="mt-3 flex flex-wrap items-end gap-4 rounded border border-zinc-800/70 bg-zinc-900/30 p-3 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
				<label class="flex flex-col gap-1">
					<span>Font family</span>
					<select
						class="rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-xs normal-case text-zinc-100 focus:border-emerald-500 focus:outline-none"
						value={fontFamily()}
						onInput={event => setFontFamily(event.currentTarget.value)}
					>
						<For each={FONT_OPTIONS}>
							{option => <option value={option.value}>{option.label}</option>}
						</For>
					</select>
				</label>

				<label class="flex flex-col gap-1">
					<span>Font size</span>
					<div class="flex items-center gap-2 text-xs normal-case text-zinc-100">
						<input
							type="range"
							min="10"
							max="26"
							step="1"
							value={fontSize()}
							onInput={handleFontSizeInput}
							class="h-2 w-40 accent-emerald-400"
						/>
						<span class="font-mono tabular-nums text-zinc-300">
							{fontSize()}px
						</span>
					</div>
				</label>

				<button
					type="button"
					class="rounded border border-zinc-700/70 bg-zinc-800 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-100 hover:bg-zinc-700"
					onMouseDown={resetFontControls}
				>
					Reset
				</button>

				<button
					type="button"
					class="rounded border border-zinc-700/70 bg-zinc-800 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-100 hover:bg-zinc-700"
					onMouseDown={toggleCursorMode}
					aria-pressed={cursorMode() === 'terminal'}
				>
					Cursor: {cursorModeLabel()}
				</button>
			</div>

			<Switch
				fallback={
					<Editor
						isFileSelected={props.isFileSelected}
						stats={() => state.selectedFileStats}
						fontSize={fontSize}
						fontFamily={fontFamily}
						cursorMode={cursorMode}
						previewBytes={() => state.selectedFilePreviewBytes}
					/>
				}
			>
				<Match when={!props.isFileSelected()}>
					<p class="mt-2 text-sm text-zinc-500">
						Select a file to view its contents. Click folders to toggle
						visibility.
					</p>
				</Match>

				<Match when={isBinary()}>
					<BinaryFileViewer
						data={() => state.selectedFilePreviewBytes}
						stats={() => state.selectedFileStats}
						fileSize={() => state.selectedFileSize}
						fontSize={fontSize}
						fontFamily={fontFamily}
					/>
				</Match>
			</Switch>
		</div>
	)
}
