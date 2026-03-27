import {
	type Accessor,
	type Component,
	type ComponentProps,
	type JSX,
	type ParentComponent,
	Show,
	batch,
	createContext,
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	onCleanup,
	onMount,
	splitProps,
	untrack,
	useContext,
} from 'solid-js'
import { Portal } from 'solid-js/web'

import {
	type Point,
	type SafePolygonHandler,
	createAnchorName,
	createSafePolygonHandler,
} from './anchor'
import { cn } from './lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface Position {
	x: number
	y: number
}

export interface ContextMenuContextValue {
	// Root state
	open: Accessor<boolean>
	setOpen: (value: boolean) => void
	position: Accessor<Position>
	setPosition: (pos: Position) => void
	// IDs
	menuId: string
	// Open submenu tracking
	openSubmenuId: Accessor<string | null>
	setOpenSubmenuId: (id: string | null) => void
	// Keyboard navigation
	focusedIndex: Accessor<number>
	setFocusedIndex: (index: number) => void
	itemCount: Accessor<number>
	registerItem: (label: string) => number
	// Type-ahead search
	searchBuffer: Accessor<string>
	itemLabels: Map<number, string>
	// Delays
	openDelay: number
	closeDelay: number
	// Nesting depth
	depth: number
}

export interface ContextMenuSubContextValue {
	// Submenu state
	open: Accessor<boolean>
	setOpen: (value: boolean) => void
	// Anchor for positioning
	anchorName: string
	triggerId: string
	contentId: string
	// Parent menu context
	parentContext: ContextMenuContextValue
	// Safe polygon handler
	safePolygon: SafePolygonHandler
	// Element refs for safe polygon
	triggerRef: Accessor<HTMLElement | null>
	setTriggerRef: (el: HTMLElement | null) => void
	contentRef: Accessor<HTMLElement | null>
	setContentRef: (el: HTMLElement | null) => void
	// Delays
	openDelay: number
	closeDelay: number
}

export interface ContextMenuProps {
	/** Controlled open state */
	open?: boolean
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void
	/** Delay before opening submenus (ms) */
	openDelay?: number
	/** Delay before closing submenus (ms) - larger for recovery */
	closeDelay?: number
	children?: JSX.Element
}

export type ContextMenuTriggerProps = ComponentProps<'div'>

export interface ContextMenuContentProps extends ComponentProps<'div'> {
	/** Gap from anchor point (px) */
	gap?: number
}

export interface ContextMenuItemProps extends ComponentProps<'div'> {
	/** Disable the item */
	disabled?: boolean
	/** Callback when item is selected */
	onSelect?: () => void
	/** Keyboard shortcut display */
	shortcut?: string
	/** Text value for type-ahead search (defaults to children text content) */
	textValue?: string
}

export type ContextMenuSeparatorProps = ComponentProps<'div'>

export interface ContextMenuGroupProps extends ComponentProps<'div'> {
	/** Label for the group */
	label?: string
}

export interface ContextMenuSubProps {
	children?: JSX.Element
}

export interface ContextMenuSubTriggerProps extends ComponentProps<'div'> {
	/** Disable the trigger */
	disabled?: boolean
	/** Text value for type-ahead search (defaults to children text content) */
	textValue?: string
}

export interface ContextMenuSubContentProps extends ComponentProps<'div'> {
	/** Gap from trigger (px) */
	gap?: number
}

// ============================================================================
// Contexts
// ============================================================================

const ContextMenuContext = createContext<ContextMenuContextValue>()
const ContextMenuSubContext = createContext<ContextMenuSubContextValue>()

function useContextMenuContext() {
	const context = useContext(ContextMenuContext)
	if (!context) {
		throw new Error(
			'ContextMenu components must be used within a <ContextMenu>'
		)
	}
	return context
}

function useContextMenuSubContext() {
	return useContext(ContextMenuSubContext)
}

// ============================================================================
// Root Component
// ============================================================================

const ContextMenu: Component<ContextMenuProps> = (props) => {
	const [local] = splitProps(props, [
		'open',
		'onOpenChange',
		'openDelay',
		'closeDelay',
		'children',
	])

	const [internalOpen, setInternalOpen] = createSignal(false)
	const [position, setPosition] = createSignal<Position>({ x: 0, y: 0 })
	const [openSubmenuId, setOpenSubmenuId] = createSignal<string | null>(null)
	const [focusedIndex, setFocusedIndex] = createSignal(-1)
	const [itemCount, setItemCount] = createSignal(0)
	const [searchBuffer, setSearchBuffer] = createSignal('')

	// Store item labels for type-ahead search
	const itemLabels = new Map<number, string>()

	const open = createMemo(() =>
		local.open !== undefined ? local.open : internalOpen()
	)

	const setOpen = (value: boolean) => {
		if (local.open === undefined) {
			setInternalOpen(value)
		}
		local.onOpenChange?.(value)
		// Reset state when closing
		if (!value) {
			batch(() => {
				setOpenSubmenuId(null)
				setFocusedIndex(-1)
				setItemCount(0)
				setSearchBuffer('')
			})
			itemLabels.clear()
		}
	}

	let itemIndex = 0
	const registerItem = (label: string) => {
		const index = itemIndex++
		setItemCount((c) => c + 1)
		itemLabels.set(index, label.toLowerCase())
		return index
	}

	// Reset item counter when menu opens
	createEffect(() => {
		if (open()) {
			itemIndex = 0
			itemLabels.clear()
		}
	})

	const uniqueId = createUniqueId()
	const menuId = `context-menu-${uniqueId}`

	const contextValue: ContextMenuContextValue = {
		open,
		setOpen,
		position,
		setPosition,
		menuId,
		openSubmenuId,
		setOpenSubmenuId,
		focusedIndex,
		setFocusedIndex,
		itemCount,
		registerItem,
		searchBuffer,
		itemLabels,
		get openDelay() { return local.openDelay ?? 150 },
		get closeDelay() { return local.closeDelay ?? 300 },
		depth: 0,
	}

	return (
		<ContextMenuContext.Provider value={contextValue}>
			{local.children}
		</ContextMenuContext.Provider>
	)
}

// ============================================================================
// Trigger Component (right-click area)
// ============================================================================

const ContextMenuTrigger: Component<ContextMenuTriggerProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'children'])
	const context = useContextMenuContext()

	const handleContextMenu = (e: MouseEvent) => {
		e.preventDefault()
		context.setPosition({ x: e.clientX, y: e.clientY })
		context.setOpen(true)
	}

	return (
		<div
			class={cn(local.class)}
			onContextMenu={handleContextMenu}
			{...others}
		>
			{local.children}
		</div>
	)
}

// ============================================================================
// Content Component (the menu itself)
// ============================================================================

const ContextMenuContent: Component<ContextMenuContentProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'children', 'gap', 'style'])
	const context = useContextMenuContext()

	let menuRef: HTMLDivElement | undefined
	let searchTimeout: ReturnType<typeof setTimeout> | undefined

	const gap = () => local.gap ?? 2

	// Close on click outside
	const handleClickOutside = (e: MouseEvent) => {
		if (menuRef && !menuRef.contains(e.target as Node)) {
			context.setOpen(false)
		}
	}

	// Type-ahead search helper
	const findItemByPrefix = (prefix: string): number => {
		const lowerPrefix = prefix.toLowerCase()
		for (const [index, label] of context.itemLabels) {
			if (label.startsWith(lowerPrefix)) {
				return index
			}
		}
		return -1
	}

	// Handle keyboard navigation and type-ahead
	const handleKeyDown = (e: KeyboardEvent) => {
		if (!context.open()) return

		switch (e.key) {
			case 'Escape':
				e.preventDefault()
				context.setOpen(false)
				break
			case 'ArrowDown':
				e.preventDefault()
				context.setFocusedIndex((context.focusedIndex() + 1) % context.itemCount())
				break
			case 'ArrowUp':
				e.preventDefault()
				context.setFocusedIndex(
					(context.focusedIndex() - 1 + context.itemCount()) % context.itemCount()
				)
				break
			case 'ArrowRight': {
				// Open submenu if focused item has one
				e.preventDefault()
				const focusedItem = menuRef?.querySelector(
					`[data-index="${context.focusedIndex()}"][aria-haspopup="menu"]`
				) as HTMLElement | null
				if (focusedItem) {
					// Trigger the submenu opening
					focusedItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
				}
				break
			}
			case 'Home':
				e.preventDefault()
				context.setFocusedIndex(0)
				break
			case 'End':
				e.preventDefault()
				context.setFocusedIndex(context.itemCount() - 1)
				break
			case 'Enter':
			case ' ': {
				e.preventDefault()
				// Trigger the focused item
				const focusedItem = menuRef?.querySelector(
					`[data-index="${context.focusedIndex()}"]`
				) as HTMLElement | null
				focusedItem?.click()
				break
			}
			default:
				// Type-ahead search: single character keys
				if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
					e.preventDefault()
					// Clear previous timeout
					if (searchTimeout) clearTimeout(searchTimeout)

					// Build search string - for now just use the single character
					// (can be extended to accumulate characters)
					const searchChar = e.key.toLowerCase()
					const matchIndex = findItemByPrefix(searchChar)
					if (matchIndex !== -1) {
						context.setFocusedIndex(matchIndex)
					}

					// Clear search buffer after 500ms
					searchTimeout = setTimeout(() => {
						// Future: clear accumulated search buffer
					}, 500)
				}
				break
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside)
		document.addEventListener('keydown', handleKeyDown)
	})

	onCleanup(() => {
		document.removeEventListener('click', handleClickOutside)
		document.removeEventListener('keydown', handleKeyDown)
		if (searchTimeout) clearTimeout(searchTimeout)
	})

	// Focus the menu and first item when it opens
	createEffect(() => {
		if (context.open() && menuRef) {
			menuRef.focus()
			// Focus first item by default
			if (context.focusedIndex() === -1 && context.itemCount() > 0) {
				context.setFocusedIndex(0)
			}
		}
	})

	// Position styles - anchored to cursor position
	const positionStyle = (): JSX.CSSProperties => {
		const pos = context.position()
		return {
			position: 'fixed',
			top: `${pos.y + gap()}px`,
			left: `${pos.x + gap()}px`,
			...(typeof local.style === 'object' ? local.style : {}),
		}
	}

	return (
		<Show when={context.open()}>
			<Portal>
				<div
					ref={menuRef}
					id={context.menuId}
					role="menu"
					tabIndex={0}
					data-state={context.open() ? 'open' : 'closed'}
					class={cn(
						// Base styles
						'z-50 min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none',
						// Animation
						'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
						'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
						local.class
					)}
					style={positionStyle()}
					{...others}
				>
					{local.children}
				</div>
			</Portal>
		</Show>
	)
}

// ============================================================================
// Item Component
// ============================================================================

const ContextMenuItem: Component<ContextMenuItemProps> = (props) => {
	const [local, others] = splitProps(props, [
		'class',
		'children',
		'disabled',
		'onSelect',
		'shortcut',
		'textValue',
	])
	const context = useContextMenuContext()

	// Extract text for type-ahead search
	// Use textValue prop if provided, otherwise try to extract from children
	const getLabel = (): string => {
		if (local.textValue) return local.textValue
		// For simple string children, use that
		if (typeof local.children === 'string') return local.children
		// Otherwise use empty string (won't be searchable)
		return ''
	}

	const index = context.registerItem(untrack(getLabel))
	const isFocused = createMemo(() => context.focusedIndex() === index)

	const handleClick = (e: MouseEvent) => {
		if (local.disabled) return
		e.stopPropagation()
		local.onSelect?.()
		context.setOpen(false)
	}

	const handleMouseEnter = () => {
		if (!local.disabled) {
			context.setFocusedIndex(index)
			// Close any open submenus when hovering a regular item
			context.setOpenSubmenuId(null)
		}
	}

	return (
		<div
			role="menuitem"
			tabIndex={-1}
			data-index={index}
			data-disabled={local.disabled ? '' : undefined}
			data-focused={isFocused() ? '' : undefined}
			aria-disabled={local.disabled}
			class={cn(
				'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-ui outline-none transition-colors',
				'data-[focused]:bg-accent data-[focused]:text-accent-foreground',
				'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				local.class
			)}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			{...others}
		>
			<span class="flex-1">{local.children}</span>
			{local.shortcut && (
				<span class="ml-auto text-ui-xs tracking-widest opacity-60">
					{local.shortcut}
				</span>
			)}
		</div>
	)
}

// ============================================================================
// Separator Component
// ============================================================================

const ContextMenuSeparator: Component<ContextMenuSeparatorProps> = (props) => {
	const [local, others] = splitProps(props, ['class'])

	return (
		<div
			role="separator"
			class={cn('-mx-1 my-1 h-px bg-border', local.class)}
			{...others}
		/>
	)
}

// ============================================================================
// Group Component
// ============================================================================

const ContextMenuGroup: ParentComponent<ContextMenuGroupProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'children', 'label'])

	return (
		<div role="group" class={cn(local.class)} {...others}>
			{local.label && (
				<div class="px-2 py-1.5 text-ui-xs font-semibold text-muted-foreground">
					{local.label}
				</div>
			)}
			{local.children}
		</div>
	)
}

// ============================================================================
// Shortcut Component (for keyboard shortcut display)
// ============================================================================

const ContextMenuShortcut: Component<ComponentProps<'span'>> = (props) => {
	const [local, others] = splitProps(props, ['class'])

	return (
		<span
			class={cn('ml-auto text-ui-xs tracking-widest opacity-60', local.class)}
			{...others}
		/>
	)
}

// ============================================================================
// Sub Menu Components (nested menus)
// ============================================================================

const ContextMenuSub: Component<ContextMenuSubProps> = (props) => {
	const parentContext = useContextMenuContext()
	const parentSubContext = useContextMenuSubContext()

	const [open, setInternalOpen] = createSignal(false)
	const [triggerRef, setTriggerRef] = createSignal<HTMLElement | null>(null)
	const [contentRef, setContentRef] = createSignal<HTMLElement | null>(null)

	const uniqueId = createUniqueId()
	const anchorName = createAnchorName('submenu')
	const triggerId = `submenu-trigger-${uniqueId}`
	const contentId = `submenu-content-${uniqueId}`

	// Create safe polygon handler for this submenu
	const safePolygon = createSafePolygonHandler('right')

	// Track last cursor position for polygon updates
	let lastCursorPos: Point = { x: 0, y: 0 }

	// Sync with parent's openSubmenuId
	const setOpen = (value: boolean) => {
		setInternalOpen(value)
		if (value) {
			parentContext.setOpenSubmenuId(triggerId)
		} else if (parentContext.openSubmenuId() === triggerId) {
			parentContext.setOpenSubmenuId(null)
		}
	}

	// Update safe polygon on mouse move when submenu is open
	const handleMouseMove = (e: MouseEvent) => {
		if (!open()) return

		const trigger = triggerRef()
		const content = contentRef()
		if (!trigger || !content) return

		lastCursorPos = { x: e.clientX, y: e.clientY }
		const triggerRect = trigger.getBoundingClientRect()
		const contentRect = content.getBoundingClientRect()

		safePolygon.update(triggerRect, contentRect, lastCursorPos)
	}

	// Add/remove global mouse move listener based on open state
	createEffect(() => {
		if (open()) {
			document.addEventListener('mousemove', handleMouseMove)
		} else {
			document.removeEventListener('mousemove', handleMouseMove)
		}
	})

	onCleanup(() => {
		document.removeEventListener('mousemove', handleMouseMove)
	})

	// Close when parent closes a different submenu
	createEffect(() => {
		const openId = parentContext.openSubmenuId()
		if (openId !== triggerId && openId !== null && open()) {
			setInternalOpen(false)
		}
	})

	// Close when root menu closes
	createEffect(() => {
		if (!parentContext.open()) {
			setInternalOpen(false)
		}
	})

	// Determine nesting depth
	const depth = parentSubContext
		? parentSubContext.parentContext.depth + 1
		: parentContext.depth + 1

	const subContextValue: ContextMenuSubContextValue = {
		open: () => open(),
		setOpen,
		anchorName,
		triggerId,
		contentId,
		parentContext: {
			...parentContext,
			depth,
		},
		safePolygon,
		triggerRef,
		setTriggerRef,
		contentRef,
		setContentRef,
		openDelay: parentContext.openDelay,
		closeDelay: parentContext.closeDelay,
	}

	return (
		<ContextMenuSubContext.Provider value={subContextValue}>
			{props.children}
		</ContextMenuSubContext.Provider>
	)
}

const ContextMenuSubTrigger: Component<ContextMenuSubTriggerProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'children', 'disabled', 'textValue'])
	const context = useContextMenuContext()
	const subContext = useContextMenuSubContext()

	if (!subContext) {
		throw new Error('ContextMenuSubTrigger must be used within ContextMenuSub')
	}

	// Extract text for type-ahead search
	const getLabel = (): string => {
		if (local.textValue) return local.textValue
		if (typeof local.children === 'string') return local.children
		return ''
	}

	const index = context.registerItem(untrack(getLabel))
	const isFocused = createMemo(() => context.focusedIndex() === index)

	let openTimeout: ReturnType<typeof setTimeout> | undefined
	let closeTimeout: ReturnType<typeof setTimeout> | undefined

	const clearTimeouts = () => {
		if (openTimeout) clearTimeout(openTimeout)
		if (closeTimeout) clearTimeout(closeTimeout)
	}

	const handleMouseEnter = () => {
		if (local.disabled) return
		clearTimeouts()
		context.setFocusedIndex(index)

		// Open with delay
		openTimeout = setTimeout(() => {
			subContext.setOpen(true)
		}, subContext.openDelay)
	}

	const handleMouseLeave = (e: MouseEvent) => {
		if (local.disabled) return
		clearTimeouts()

		// Close with delay (for recovery)
		closeTimeout = setTimeout(() => {
			// Check if mouse is in safe zone using the polygon handler
			const point: Point = { x: e.clientX, y: e.clientY }
			if (!subContext.safePolygon.isInSafeZone(point)) {
				subContext.setOpen(false)
			}
		}, subContext.closeDelay)
	}

	// Handle keyboard navigation into submenu
	const handleKeyDown = (e: KeyboardEvent) => {
		if (local.disabled) return

		if (e.key === 'ArrowRight' || e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			subContext.setOpen(true)
		}
	}

	onCleanup(clearTimeouts)

	// Anchor styles for CSS anchor positioning
	const anchorStyle = (): JSX.CSSProperties => ({
		'anchor-name': subContext.anchorName,
	})

	return (
		<div
			ref={(el) => subContext.setTriggerRef(el)}
			id={subContext.triggerId}
			role="menuitem"
			aria-haspopup="menu"
			aria-expanded={subContext.open()}
			tabIndex={-1}
			data-index={index}
			data-disabled={local.disabled ? '' : undefined}
			data-focused={isFocused() ? '' : undefined}
			data-state={subContext.open() ? 'open' : 'closed'}
			aria-disabled={local.disabled}
			class={cn(
				'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-ui outline-none transition-colors',
				'data-[focused]:bg-accent data-[focused]:text-accent-foreground',
				'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
				'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				local.class
			)}
			style={anchorStyle()}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onKeyDown={handleKeyDown}
			{...others}
		>
			<span class="flex-1">{local.children}</span>
			<svg
				class="ml-auto size-4"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="9 18 15 12 9 6" />
			</svg>
		</div>
	)
}

const ContextMenuSubContent: Component<ContextMenuSubContentProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'children', 'gap', 'style'])
	const subContext = useContextMenuSubContext()

	if (!subContext) {
		throw new Error('ContextMenuSubContent must be used within ContextMenuSub')
	}

	const gap = () => local.gap ?? 2

	// Handle keyboard navigation
	const handleKeyDown = (e: KeyboardEvent) => {
		switch (e.key) {
			case 'Escape':
			case 'ArrowLeft':
				e.preventDefault()
				e.stopPropagation()
				subContext.setOpen(false)
				break
		}
	}

	// CSS anchor positioning styles
	const positionStyle = (): JSX.CSSProperties => ({
		position: 'fixed',
		'position-anchor': subContext.anchorName,
		'position-area': 'right',
		'position-try-fallbacks': 'flip-inline',
		'margin-left': `${gap()}px`,
		...(typeof local.style === 'object' ? local.style : {}),
	})

	return (
		<Show when={subContext.open()}>
			<Portal>
				<div
					ref={(el) => subContext.setContentRef(el)}
					id={subContext.contentId}
					role="menu"
					tabIndex={0}
					data-state={subContext.open() ? 'open' : 'closed'}
					class={cn(
						// Base styles
						'z-50 min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none',
						// Animation
						'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
						local.class
					)}
					style={positionStyle()}
					onKeyDown={handleKeyDown}
					{...others}
				>
					{local.children}
				</div>
			</Portal>
		</Show>
	)
}

// ============================================================================
// Label Component (non-interactive heading)
// ============================================================================

const ContextMenuLabel: Component<ComponentProps<'div'> & { inset?: boolean }> = (
	props
) => {
	const [local, others] = splitProps(props, ['class', 'inset'])

	return (
		<div
			class={cn(
				'px-2 py-1.5 text-ui-sm font-semibold',
				local.inset && 'pl-8',
				local.class
			)}
			{...others}
		/>
	)
}

// ============================================================================
// Exports
// ============================================================================

export {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuGroup,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubTrigger,
	ContextMenuSubContent,
	ContextMenuLabel,
}
