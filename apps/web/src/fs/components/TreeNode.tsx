import { createEffect, createSignal, For, Show } from 'solid-js'
import { createSwitchTransition } from '@solid-primitives/transition-group'
import type { FsDirTreeNode, FsTreeNode } from '@repo/fs'
import { getBracketDepthBorderClass } from '@repo/code-editor'
import { useFs } from '../../fs/context/FsContext'
import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'
import { VsFile } from '@repo/icons/vs/VsFile'
import { VsFolder } from '@repo/icons/vs/VsFolder'
import { VsFolderOpened } from '@repo/icons/vs/VsFolderOpened'

const TREE_INDENT_PX = 8

type TreeNodeProps = {
	node: FsTreeNode
	hasParent?: boolean
	onHover?: (hovered: boolean) => void
}

export const TreeNode = (props: TreeNodeProps) => {
	const [state, actions] = useFs()
	const [isHovered, setIsHovered] = createSignal(false)
	const [childHoverCount, setChildHoverCount] = createSignal(0)
	const [branchLineRef, setBranchLineRef] = createSignal<HTMLSpanElement>()

	const showBranchLine = () => isHovered() || childHoverCount() > 0
	const isDir = () => props.node.kind === 'dir'
	const isSelected = () => state.selectedPath === props.node.path
	const isOpen = () => isDir() && state.expanded[props.node.path]
	const indentationOffset = () =>
		Math.max(props.node.depth - 1, 0) * TREE_INDENT_PX

	const rowIndentStyle = () => {
		const offset = indentationOffset()
		if (offset === 0) return undefined
		const offsetPx = `${offset}px`
		return {
			marginLeft: `-${offsetPx}`,
			paddingLeft: offsetPx,
		}
	}

	const childBranchBorderClass = () =>
		getBracketDepthBorderClass(Math.max(props.node.depth + 1, 1))

	const handleDirClick = () => {
		actions.toggleDir(props.node.path)
	}

	const handleSelect = () => {
		void actions.selectPath(props.node.path)
	}

	const handleClick = () => {
		if (isDir()) {
			handleDirClick()
		} else {
			handleSelect()
		}
	}

	const handleRowHover = (hovered: boolean) => {
		setIsHovered(hovered)
	}

	const handleChildHover = (hovered: boolean) => {
		setChildHoverCount((c) => c + (hovered ? 1 : -1))
	}

	// Track whether we're contributing to parent's branch line
	// (hovered AND not handling our own branch line via isOpen)
	let lastContributed = false
	// Notify parent only when our "contribution" status changes
	createEffect(() => {
		const contributes = isHovered() && !isOpen()
		if (contributes !== lastContributed) {
			lastContributed = contributes
			props.onHover?.(contributes)
		}
	})

	// Branch line enter/exit animation
	const branchLineEl = () => (isOpen() ? branchLineRef() : undefined)
	createSwitchTransition(branchLineEl, {
		onEnter(el, done) {
			el.style.opacity = '0'
			requestAnimationFrame(() => {
				el.style.transition = 'opacity 200ms ease-out'
				el.style.opacity = showBranchLine() ? '0.4' : '0'
				el.addEventListener('transitionend', done, { once: true })
			})
		},
		onExit(el, done) {
			el.style.transition = 'opacity 200ms ease-out'
			el.style.opacity = '0'
			el.addEventListener('transitionend', done, { once: true })
		},
	})

	// Update branch line opacity when hover state changes (after initial enter animation)
	createEffect(() => {
		const el = branchLineRef()
		if (el && isOpen()) {
			el.style.opacity = showBranchLine() ? '0.4' : '0'
		}
	})

	return (
		<>
			<div
				class="relative group"
				style={rowIndentStyle()}
				onMouseEnter={() => handleRowHover(true)}
				onMouseLeave={() => handleRowHover(false)}
			>
				<span
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 right-0  border-b border-t transition-colors duration-150 ease-in-out"
					style={{ left: `-${indentationOffset()}px` }}
					classList={{
						'border-cyan-700': isSelected(),
						'border-transparent': !isSelected(),
						'group-hover:bg-zinc-800/50': !isSelected(),
					}}
				/>

				{/* TODO: Move keyboard controls (Enter/Space to toggle) to keyboard manager */}
				<button
					type="button"
					onMouseDown={handleClick}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault()
							handleClick()
						}
					}}
					aria-expanded={isDir() ? isOpen() : undefined}
					class="relative z-10 flex w-full items-center overflow-hidden rounded text-left text-sm transition"
				>
					<span
						class="w-4 text-center text-[10px] text-zinc-500"
						classList={{ 'text-cyan-700': isSelected() }}
					>
						{isDir() ? isOpen() ? <VsChevronDown /> : <VsChevronRight /> : ''}
					</span>
					<span
						class="mr-2 flex items-center justify-center"
						classList={{ 'text-cyan-700': isSelected() }}
					>
						<Show when={isDir()} fallback={<VsFile size={16} />}>
							<Show when={isOpen()} fallback={<VsFolder size={16} />}>
								<VsFolderOpened size={16} />
							</Show>
						</Show>
					</span>
					<span
						class="truncate text-zinc-200"
						classList={{ 'text-cyan-700': isSelected() }}
					>
						{isDir() ? props.node.name || 'root' : props.node.name}
					</span>
				</button>
			</div>

			<Show when={isDir() && isOpen()}>
				<div class="relative pl-2">
					<span
						ref={setBranchLineRef}
						aria-hidden="true"
						class={`pointer-events-none absolute left-1.5 top-0 bottom-0 z-10 border-l transition-opacity duration-200 ease-linear ${childBranchBorderClass()}`}
						style={{ opacity: 0 }}
					/>
					<For each={(props.node as FsDirTreeNode).children}>
						{(child) => (
							<TreeNode node={child} hasParent onHover={handleChildHover} />
						)}
					</For>
				</div>
			</Show>
		</>
	)
}
