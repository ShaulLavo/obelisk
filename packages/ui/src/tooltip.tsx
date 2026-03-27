import {
	type Accessor,
	type Component,
	type ComponentProps,
	type JSX,
	createContext,
	createMemo,
	createSignal,
	createUniqueId,
	onCleanup,
	splitProps,
	useContext,
} from 'solid-js'
import { Portal } from 'solid-js/web'

import {
	type Placement,
	createAnchorName,
	getArrowAlignment,
	getArrowPlacement,
	getFlipStrategy,
	getGapMargin,
	getPositionArea,
} from './anchor'
import { cn } from './lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface TooltipContextValue {
	open: Accessor<boolean>
	setOpen: (value: boolean) => void
	anchorName: string
	triggerId: string
	contentId: string
	placement: Accessor<Placement>
	openDelay: number
	closeDelay: number
}

export interface TooltipProps {
	/** Controlled open state */
	open?: boolean
	/** Default open state (uncontrolled) */
	defaultOpen?: boolean
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void
	/** Placement of the tooltip relative to trigger */
	placement?: Placement
	/** Delay before showing tooltip (ms) */
	openDelay?: number
	/** Delay before hiding tooltip (ms) */
	closeDelay?: number
	children?: JSX.Element
}

export interface TooltipTriggerProps extends ComponentProps<'button'> {
	/** Render as a different element (use asChild pattern) */
	asChild?: boolean
}

export interface TooltipContentProps extends ComponentProps<'div'> {
	/** Override placement for this content */
	placement?: Placement
	/** Gap between tooltip and trigger (px) */
	gap?: number
	/** Show arrow pointing to trigger */
	arrow?: boolean
	/** Arrow size in pixels */
	arrowSize?: number
}

export interface TooltipArrowProps extends ComponentProps<'div'> {
	/** Arrow size in pixels */
	size?: number
}

// ============================================================================
// Context
// ============================================================================

const TooltipContext = createContext<TooltipContextValue>()

function useTooltipContext() {
	const context = useContext(TooltipContext)
	if (!context) {
		throw new Error('Tooltip components must be used within a <Tooltip>')
	}
	return context
}

// ============================================================================
// Root Component
// ============================================================================

const Tooltip: Component<TooltipProps> = (props) => {
	const [local] = splitProps(props, [
		'open',
		'defaultOpen',
		'onOpenChange',
		'placement',
		'openDelay',
		'closeDelay',
		'children',
	])

	// Controlled vs uncontrolled state
	const [internalOpen, setInternalOpen] = createSignal(
		local.defaultOpen ?? false
	)

	const open = createMemo(() =>
		local.open !== undefined ? local.open : internalOpen()
	)

	const setOpen = (value: boolean) => {
		if (local.open === undefined) {
			setInternalOpen(value)
		}
		local.onOpenChange?.(value)
	}

	// Generate unique IDs
	const uniqueId = createUniqueId()
	const anchorName = createAnchorName('tooltip')
	const triggerId = `tooltip-trigger-${uniqueId}`
	const contentId = `tooltip-content-${uniqueId}`

	const placement = createMemo(() => local.placement ?? 'top')

	const contextValue: TooltipContextValue = {
		open,
		setOpen,
		anchorName,
		triggerId,
		contentId,
		placement,
		get openDelay() { return local.openDelay ?? 150 },
		get closeDelay() { return local.closeDelay ?? 0 },
	}

	return (
		<TooltipContext.Provider value={contextValue}>
			{local.children}
		</TooltipContext.Provider>
	)
}

// ============================================================================
// Trigger Component
// ============================================================================

const TooltipTrigger: Component<TooltipTriggerProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'children', 'asChild'])
	const context = useTooltipContext()

	let openTimeout: ReturnType<typeof setTimeout> | undefined
	let closeTimeout: ReturnType<typeof setTimeout> | undefined

	const clearTimeouts = () => {
		if (openTimeout) clearTimeout(openTimeout)
		if (closeTimeout) clearTimeout(closeTimeout)
	}

	const handleMouseEnter = () => {
		clearTimeouts()
		if (context.openDelay > 0) {
			openTimeout = setTimeout(() => context.setOpen(true), context.openDelay)
		} else {
			context.setOpen(true)
		}
	}

	const handleMouseLeave = () => {
		clearTimeouts()
		if (context.closeDelay > 0) {
			closeTimeout = setTimeout(() => context.setOpen(false), context.closeDelay)
		} else {
			context.setOpen(false)
		}
	}

	const handleFocus = () => {
		clearTimeouts()
		context.setOpen(true)
	}

	const handleBlur = () => {
		clearTimeouts()
		context.setOpen(false)
	}

	onCleanup(clearTimeouts)

	// Style to apply anchor-name
	const anchorStyle = (): JSX.CSSProperties => ({
		'anchor-name': context.anchorName,
	})

	return (
		<button
			id={context.triggerId}
			aria-describedby={context.open() ? context.contentId : undefined}
			class={cn('inline-flex', local.class)}
			style={anchorStyle()}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onFocus={handleFocus}
			onBlur={handleBlur}
			{...others}
		>
			{local.children}
		</button>
	)
}

// ============================================================================
// Content Component
// ============================================================================

const TooltipContent: Component<TooltipContentProps> = (props) => {
	const [local, others] = splitProps(props, [
		'class',
		'children',
		'placement',
		'gap',
		'arrow',
		'arrowSize',
		'style',
	])
	const context = useTooltipContext()

	const placement = createMemo(() => local.placement ?? context.placement())
	const gap = createMemo(() => local.gap ?? 8)
	const arrowSize = createMemo(() => local.arrowSize ?? 6)

	// Adjust gap for arrow
	const totalGap = createMemo(() =>
		local.arrow ? gap() + arrowSize() : gap()
	)

	// CSS anchor positioning styles
	const positionedStyle = (): JSX.CSSProperties => ({
		position: 'fixed',
		'position-anchor': context.anchorName,
		'position-area': getPositionArea(placement()),
		'position-try-fallbacks': getFlipStrategy(placement()),
		[getGapMargin(placement())]: `${totalGap()}px`,
		// Merge with user-provided style
		...(typeof local.style === 'object' ? local.style : {}),
	})

	return (
		<Portal>
			<div
				id={context.contentId}
				role="tooltip"
				data-state={context.open() ? 'open' : 'closed'}
				data-placement={placement()}
				class={cn(
					// Base styles
					'z-50 overflow-hidden rounded-md bg-popover px-3 py-1.5 text-ui-sm text-popover-foreground shadow-md',
					// Animation
					'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
					'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					// Hidden when closed
					'data-[state=closed]:hidden',
					local.class
				)}
				style={positionedStyle()}
				{...others}
			>
				{local.children}
				{local.arrow && <TooltipArrow size={arrowSize()} />}
			</div>
		</Portal>
	)
}

// ============================================================================
// Arrow Component
// ============================================================================

const TooltipArrow: Component<TooltipArrowProps> = (props) => {
	const [local, others] = splitProps(props, ['class', 'size', 'style'])
	const context = useTooltipContext()

	const size = () => local.size ?? 6

	// Determine arrow position based on tooltip placement
	const arrowPosition = createMemo(() => getArrowPlacement(context.placement()))
	const arrowAlignment = createMemo(() => getArrowAlignment(context.placement()))

	// Arrow styles based on position
	const arrowStyle = (): JSX.CSSProperties => {
		const pos = arrowPosition()
		const align = arrowAlignment()
		const s = size()

		const base: JSX.CSSProperties = {
			position: 'absolute',
			width: `${s}px`,
			height: `${s}px`,
			// Rotate square to make diamond, clip to triangle
			transform: 'rotate(45deg)',
			'background-color': 'inherit',
		}

		// Position the arrow on the correct edge
		if (pos === 'top') {
			base.top = `-${s / 2}px`
		} else if (pos === 'bottom') {
			base.bottom = `-${s / 2}px`
		} else if (pos === 'left') {
			base.left = `-${s / 2}px`
		} else if (pos === 'right') {
			base.right = `-${s / 2}px`
		}

		// Alignment along the edge
		if (pos === 'top' || pos === 'bottom') {
			if (align === 'start') {
				base.left = `${s}px`
			} else if (align === 'end') {
				base.right = `${s}px`
			} else {
				base.left = '50%'
				base['margin-left'] = `-${s / 2}px`
			}
		} else {
			if (align === 'start') {
				base.top = `${s}px`
			} else if (align === 'end') {
				base.bottom = `${s}px`
			} else {
				base.top = '50%'
				base['margin-top'] = `-${s / 2}px`
			}
		}

		return {
			...base,
			...(typeof local.style === 'object' ? local.style : {}),
		}
	}

	return <div class={cn(local.class)} style={arrowStyle()} {...others} />
}

// ============================================================================
// Exports
// ============================================================================

export { Tooltip, TooltipTrigger, TooltipContent, TooltipArrow }
