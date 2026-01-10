import { For } from 'solid-js'
import { VsSettingsGear } from '@repo/icons/vs/VsSettingsGear'
import { VsTools } from '@repo/icons/vs/VsTools'
import { useFs } from '../context/FsContext'

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

export const SystemFilesSection = () => {
	const [, actions] = useFs()

	const isSelected = (path: string) => actions.isSelectedPath(path)

	const handleFileSelect = async (path: string) => {
		void actions.selectPath(path)
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
					<button
						type="button"
						onMouseDown={() => handleFileSelect(file.path)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								handleFileSelect(file.path)
							}
						}}
						class="tree-node-button"
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
							class="truncate text-sm"
							classList={{
								'text-cyan-700': isSelected(file.path),
								'text-foreground/90': !isSelected(file.path),
							}}
						>
							{file.name}
						</span>
					</button>
				</div>
			)}
		</For>
	)
}
