import { createMemo } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { getIconForFile } from '../utils/fileIcons'

type FileIconProps = {
	name: string
	size?: number
	class?: string
}

export const FileIcon = (props: FileIconProps) => {
	const Icon = createMemo(() => getIconForFile(props.name))
	return <Dynamic component={Icon()} size={props.size} class={props.class} />
}
