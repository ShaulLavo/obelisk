import { Accessor, createMemo, For, Show, onCleanup, onMount } from 'solid-js'
import type { FsDirTreeNode } from '@repo/fs'
import {
	Accordion,
	AccordionItem,
	AccordionContent,
} from '@repo/ui/accordion'
import * as AccordionPrimitive from '@kobalte/core/accordion'
import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { useFocusManager } from '~/focus/focusManager'
import { useFs } from '../context/FsContext'
import { TreeNode } from './TreeNode'
import { FsToolbar } from './FsToolbar'
import { CreationRow } from './CreationRow'
import { SystemFilesSection } from './SystemFilesSection'

type TreeViewProps = {
	tree: Accessor<FsDirTreeNode | undefined>
	loading: Accessor<boolean>
}

export const TreeView = (props: TreeViewProps) => {
	const focus = useFocusManager()
	const [state, actions] = useFs()
	let containerRef: HTMLDivElement = null!

	onMount(() => {
		if (!containerRef) return
		const unregister = focus.registerArea('fileTree', () => containerRef)
		onCleanup(unregister)
	})

	const parentPath = createMemo(() => {
		const selected = state.selectedPath
		if (!selected) return ''

		const node = state.selectedNode
		if (!node) return ''

		if (node.kind === 'dir') {
			return node.path
		}
		const lastSlash = selected.lastIndexOf('/')
		return lastSlash > 0 ? selected.slice(0, lastSlash) : ''
	})

	return (
		<div ref={containerRef} class="h-full flex flex-col overflow-auto">
			<Accordion multiple defaultValue={['system', 'explorer']} class="flex flex-col min-h-0">
				{/* System Section */}
				<AccordionItem value="system" class="flex-shrink-0">
					<div class="sticky top-0 bg-muted/60 z-10 flex items-center">
						<AccordionPrimitive.Header class="flex-1">
							<AccordionPrimitive.Trigger class="flex items-center gap-1 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [&[data-expanded]>svg]:rotate-180">
								<VsChevronDown size={16} class="shrink-0 transition-transform duration-200 -rotate-90" />
								System
							</AccordionPrimitive.Trigger>
						</AccordionPrimitive.Header>
					</div>
					<AccordionContent>
						<SystemFilesSection />
					</AccordionContent>
				</AccordionItem>

				{/* Explorer Section */}
				<AccordionItem value="explorer" class="flex-1 min-h-0">
					<div class="sticky top-[22px] bg-muted/60 z-10 flex items-center">
						<AccordionPrimitive.Header class="flex-1">
							<AccordionPrimitive.Trigger class="flex items-center gap-1 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground [&[data-expanded]>svg]:rotate-180">
								<VsChevronDown size={16} class="shrink-0 transition-transform duration-200 -rotate-90" />
								Explorer
							</AccordionPrimitive.Trigger>
						</AccordionPrimitive.Header>
						<FsToolbar parentPath={parentPath} />
					</div>
					<AccordionContent>
						<Show
							when={!props.loading() && props.tree()}
							fallback={
								<p class="text-sm text-muted-foreground">
									{props.loading() ? '' : 'No filesystem loaded.'}
								</p>
							}
						>
							{(tree) => (
								<>
									<For each={tree().children}>
										{(child) => <TreeNode node={child} />}
									</For>
									<Show
										when={
											state.creationState && state.creationState.parentPath === ''
										}
									>
										<CreationRow
											depth={1}
											type={state.creationState!.type}
											onSubmit={async (name) => {
												const parent = state.creationState!.parentPath
												const type = state.creationState!.type
												if (type === 'file') {
													await actions.createFile(parent, name)
												} else {
													await actions.createDir(parent, name)
												}
												actions.setCreationState(null)
											}}
											onCancel={() => actions.setCreationState(null)}
										/>
									</Show>
								</>
							)}
						</Show>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	)
}
