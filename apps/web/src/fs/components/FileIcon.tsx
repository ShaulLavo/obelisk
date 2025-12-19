import { getIconForFile } from '../utils/fileIcons'

type FileIconProps = {
	name: string
	size?: number
	class?: string
}

export const FileIcon = (props: FileIconProps) => {
	const Icon = getIconForFile(props.name)
	return <Icon size={props.size} class={props.class} />
}
