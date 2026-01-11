import { For } from 'solid-js'
import { VsSettingsGear } from '@repo/icons/vs/VsSettingsGear'
import { VsTools } from '@repo/icons/vs/VsTools'
import { useFs } from '../context/FsContext'
import { Button } from '@repo/ui/button'

type SystemFile = {
	name: string
	path: string
	icon?: 'settings' | 'tools'
}

const SYSTEM_FILES: SystemFile[] = [
	{
		name: 'defaultSettings.json',
		path: '/.system/defaultSettings.json',
		icon: 'settings',
	},
	{
		name: 'userSettings.json',
		path: '/.system/userSettings.json',
		icon: 'settings',
	},
]

type SystemFilesSectionProps = {
	onFileOpen?: (filePath: string) => void
}

export const SystemFilesSection = (props: SystemFilesSectionProps) => {
	const [, actions] = useFs()

	const isSelected = (path: string) => actions.isSelectedPath(path)

	const handleFileSelect = async (path: string) => {
		void actions.selectPath(path)
		// Also open the file in the editor
		props.onFileOpen?.(path)
	}

	const renderFileIcon = (file: SystemFile) => {
		switch (file.icon) {
			case 'settings':
				return <VsSettingsGear size={16} />
			case 'tools':
				return <VsTools size={16} />
			default:
				return <VsSettingsGear size={16} />
		}
	}

	return (
		<For each={SYSTEM_FILES}>
			{(file) => (
				<div class="relative group">
					<span
						aria-hidden="true"
						class="tree-node-row-highlight"
						classList={{
							'border-cyan-700': isSelected(file.path),
							'border-transparent': !isSelected(file.path),
							'group-hover:bg-foreground/10': !isSelected(file.path),
						}}
					/>
					<Button
						variant="ghost"
						onMouseDown={() => handleFileSelect(file.path)}
						onKeyDown={(e: KeyboardEvent) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								handleFileSelect(file.path)
							}
						}}
						class="tree-node-button justify-start gap-0 h-auto min-h-0 p-0 font-normal text-ui hover:bg-transparent text-foreground hover:text-foreground"
					>
						<span
							class="tree-node-icon"
							classList={{
								'text-cyan-700': isSelected(file.path),
								'text-amber-600': !isSelected(file.path),
							}}
						>
							{renderFileIcon(file)}
						</span>
						<span
							class="truncate text-ui"
							classList={{
								'text-cyan-700': isSelected(file.path),
								'text-foreground/90': !isSelected(file.path),
							}}
						>
							{file.name}
						</span>
					</Button>
				</div>
			)}
		</For>
	)
}
