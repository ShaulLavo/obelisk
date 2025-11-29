import { Accessor, Show } from 'solid-js'

type SelectedFilePanelProps = {
	isFileSelected: Accessor<boolean>
	content: Accessor<string>
}

export const SelectedFilePanel = (props: SelectedFilePanelProps) => (
	<div class="flex h-full flex-col font-mono">
		<p class="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
			Selected file content
		</p>
		<Show
			when={props.isFileSelected()}
			fallback={
				<p class="mt-2 text-sm text-zinc-500">
					Select a file to view its contents. Click folders to toggle
					visibility.
				</p>
			}
		>
			<pre class="mt-2 flex-1 font-mono overflow-auto whitespace-pre-wrap text-sm">
				{props.content()}
			</pre>
		</Show>
	</div>
)
