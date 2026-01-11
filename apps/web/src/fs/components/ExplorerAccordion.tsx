import { createMemo, JSX, onCleanup, onMount, ParentComponent } from 'solid-js'
import { Accordion, AccordionItem, AccordionContent } from '@repo/ui/accordion'
import * as AccordionPrimitive from '@kobalte/core/accordion'
import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { Flex } from '@repo/ui/flex'
import { useFocusManager } from '~/focus/focusManager'
import { useFs } from '../context/FsContext'
import { FsToolbar } from './FsToolbar'
import { SystemFilesSection } from './SystemFilesSection'

type FsAccordionSectionProps = {
	value: string
	title: string
	class?: string
	headerClass?: string
	toolbar?: JSX.Element
	children: JSX.Element
}

const FsAccordionSection = (props: FsAccordionSectionProps) => (
	<AccordionItem value={props.value} class={props.class}>
		<AccordionPrimitive.Header
			class={`flex items-center w-full shrink-0 bg-background ${props.headerClass ?? ''}`}
		>
			<AccordionPrimitive.Trigger class="text-ui-xs flex w-full items-center gap-1 py-1 px-1 font-semibold uppercase tracking-[0.08em] text-muted-foreground focus:outline-none [&:not([data-expanded])>svg]:-rotate-90">
				<VsChevronDown
					size={16}
					class="shrink-0 transition-transform duration-200"
				/>
				{props.title}
			</AccordionPrimitive.Trigger>
			{props.toolbar}
		</AccordionPrimitive.Header>
		<AccordionContent class="min-h-0 flex-1">{props.children}</AccordionContent>
	</AccordionItem>
)

export const ExplorerAccordion: ParentComponent = (props) => {
	const focus = useFocusManager()
	const [state] = useFs()
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
		<Flex
			ref={containerRef}
			flexDirection="col"
			alignItems="stretch"
			class="h-full overflow-hidden"
		>
			<Accordion
				multiple
				defaultValue={['system', 'explorer']}
				class="flex flex-col h-full overflow-hidden"
			>
				<FsAccordionSection
					value="system"
					title="System"
					class="shrink-0 flex flex-col max-h-[30%] border-b border-border/50"
				>
					<div class="overflow-auto max-h-full">
						<SystemFilesSection />
					</div>
				</FsAccordionSection>

				<FsAccordionSection
					value="explorer"
					title="Explorer"
					class="flex-1 min-h-0 flex flex-col"
					headerClass="border-b border-border/50"
					toolbar={<FsToolbar parentPath={parentPath} />}
				>
					{props.children}
				</FsAccordionSection>
			</Accordion>
		</Flex>
	)
}
