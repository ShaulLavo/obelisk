import { Accessor, createMemo } from 'solid-js'
import { Button } from '@repo/ui/button'
import { Flex } from '@repo/ui/flex'

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
		<Flex alignItems="center" class="gap-2">
			{displayPath()}
			<Button
				variant="outline"
				size="sm"
				class="h-auto py-1 px-3 text-ui-xs font-medium border-zinc-700/70 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50"
				onMouseDown={() => props.onRefresh()}
			>
				Refresh
			</Button>
		</Flex>
	)
}
