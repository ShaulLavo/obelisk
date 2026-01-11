import { Flex } from '@repo/ui/flex'
import { Resizable } from '~/components/Resizable'
import { useFs } from '../../fs/context/FsContext'
import { SyncStatusProvider } from '../context/SyncStatusContext'
import { SelectedFilePanel } from './SelectedFilePanel'
import { TreeView } from './TreeView'

import { ExplorerAccordion } from './ExplorerAccordion'

export const Fs = () => {
	const [state] = useFs()

	// A file is selected only if there's an actual selectedPath pointing to a file
	const isFileSelected = () => {
		const path = state.selectedPath
		if (!path) return false
		return state.lastKnownFileNode?.kind === 'file'
	}

	return (
		<SyncStatusProvider>
			<Flex
				flexDirection="col"
				class="h-full min-h-0 overflow-hidden rounded-lg border border-border/30 bg-muted/60 shadow-xl"
			>
				<Resizable
					orientation="horizontal"
					storageKey="fs-horizontal-panel-size"
					defaultSizes={[0.3, 0.7]}
					handleAriaLabel="Resize file tree"
				>
					<ExplorerAccordion>
						<TreeView tree={() => state.tree} loading={() => state.loading} />
					</ExplorerAccordion>
					<SelectedFilePanel
						isFileSelected={isFileSelected}
						currentPath={state.lastKnownFilePath}
					/>
				</Resizable>
			</Flex>
		</SyncStatusProvider>
	)
}
