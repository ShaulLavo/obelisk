import { Accessor, createMemo } from 'solid-js'

type FsHeaderProps = {
	activeDirPath: Accessor<string>
	rootName: Accessor<string | undefined>
	onRefresh: () => void
}

export const FsHeader = (props: FsHeaderProps) => {
	const displayPath = createMemo(
		() => props.activeDirPath() || props.rootName() || 'root'
	)

	return (
		<div class="flex items-center gap-2">
			{displayPath()}
			<button
				type="button"
				class="rounded border border-zinc-700/70 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
				onMouseDown={() => props.onRefresh()}
			>
				Refresh
			</button>
		</div>
	)
}
