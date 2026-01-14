import { Flex } from '@repo/ui/flex'
import { Resizable } from '~/components/Resizable'
import { useFs } from '../../fs/context/FsContext'
import { SyncStatusProvider } from '../context/SyncStatusContext'
import { SplitEditorPanel } from './SplitEditorPanel'
import { TreeView } from './TreeView'
import { createSignal } from 'solid-js'
import type { LayoutManager } from '../../split-editor'
import type { DocumentStore } from '../doc'

import { ExplorerAccordion } from './ExplorerAccordion'

export const Fs = () => {
	const [state, actions] = useFs()
	const [layoutManager, setLayoutManager] = createSignal<LayoutManager>()
	const [documentStore, setDocumentStore] = createSignal<DocumentStore>()

	const openFileAsTab = (filePath: string) => {
		const manager = layoutManager()
		if (manager && (manager as any).openFileAsTab) {
			;(manager as any).openFileAsTab(filePath)
			actions.setSelectedPathOnly(filePath)
		}
	}

	return (
		<SyncStatusProvider documentStore={documentStore()}>
			<Flex
				flexDirection="col"
				class="h-full min-h-0 overflow-hidden rounded-lg  bg-muted/60 shadow-xl"
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
						onLayoutManagerReady={setLayoutManager}
						onDocumentStoreReady={setDocumentStore}
					/>
				</Resizable>
			</Flex>
		</SyncStatusProvider>
	)
}
