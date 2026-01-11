import { Flex } from '@repo/ui/flex'
import { Resizable } from '~/components/Resizable'
import { useFs } from '../../fs/context/FsContext'
import { SyncStatusProvider } from '../context/SyncStatusContext'
import { SplitEditorPanel } from './SplitEditorPanel'
import { TreeView } from './TreeView'
import { createSignal } from 'solid-js'
import type { LayoutManager } from '../../split-editor'

import { ExplorerAccordion } from './ExplorerAccordion'

export const Fs = () => {
	const [state] = useFs()
	const [layoutManager, setLayoutManager] = createSignal<LayoutManager>()

	// A file is selected only if there's an actual selectedPath pointing to a file
	const isFileSelected = () => {
		const path = state.selectedPath
		const fileNode = state.lastKnownFileNode
		console.log('[Fs] isFileSelected - selectedPath:', path, 'lastKnownFileNode:', fileNode)
		if (!path) return false
		return fileNode?.kind === 'file'
	}

	// Function to open a file as a tab
	const openFileAsTab = (filePath: string) => {
		console.log('[Fs] openFileAsTab called with filePath:', filePath)
		const manager = layoutManager()
		if (manager && (manager as any).openFileAsTab) {
			console.log('[Fs] Layout manager available, calling openFileAsTab')
			;(manager as any).openFileAsTab(filePath)
		} else {
			console.log('[Fs] No layout manager or openFileAsTab method available, manager:', !!manager)
		}
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
					<ExplorerAccordion onSystemFileOpen={openFileAsTab}>
						<TreeView
							tree={() => state.tree}
							loading={() => state.loading}
							onFileOpen={openFileAsTab}
							onFileCreate={openFileAsTab}
						/>
					</ExplorerAccordion>
					<SplitEditorPanel
						isFileSelected={isFileSelected}
						currentPath={state.lastKnownFilePath}
						onLayoutManagerReady={setLayoutManager}
					/>
				</Resizable>
			</Flex>
		</SyncStatusProvider>
	)
}
