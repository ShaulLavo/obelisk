import { Resizable } from '~/components/Resizable'
import { useFs } from '../../fs/context/FsContext'
import { SelectedFilePanel } from './SelectedFilePanel'
import { TreeView } from './TreeView'

export const Fs = () => {
	const [state, actions] = useFs()

	// A file is selected only if there's an actual selectedPath pointing to a file
	const isFileSelected = () => {
		const path = state.selectedPath
		if (!path) return false
		return state.lastKnownFileNode?.kind === 'file'
	}

	return (
		<div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/30 bg-muted/60 shadow-xl">
			<button type="button" onClick={() => void actions.pickNewRoot()}>
				Pick New Folder
			</button>
			<Resizable
				orientation="horizontal"
				storageKey="fs-horizontal-panel-size"
				defaultSizes={[0.3, 0.7]}
				handleAriaLabel="Resize file tree"
			>
				<TreeView tree={() => state.tree} loading={() => state.loading} />
				<SelectedFilePanel
					isFileSelected={isFileSelected}
					currentPath={state.lastKnownFilePath}
				/>
			</Resizable>
		</div>
	)
}
