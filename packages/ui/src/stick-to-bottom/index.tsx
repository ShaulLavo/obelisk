/*
  SolidJS implementation of a "stick to bottom" utility based on
  the StackBlitz React version provided in the prompt. This offers:
  - useStickToBottom() hook returning refs and controls
  - <StickToBottom> component with context and <StickToBottom.Content>
*/

import {
	Accessor,
	Component,
	JSX,
	createContext,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	splitProps,
	useContext
} from 'solid-js'

// ---------------------------------------
// Types
// ---------------------------------------

export interface StickToBottomState {
	scrollTop: number
	lastScrollTop?: number
	ignoreScrollToTop?: number
	targetScrollTop: number
	calculatedTargetScrollTop: number
	scrollDifference: number
	resizeDifference: number

	animation?: {
		behavior: 'instant' | Required<SpringAnimation>
		ignoreEscapes: boolean
		promise?: Promise<boolean>
	}
	lastTick?: number
	velocity: number
	accumulated: number

	escapedFromLock: boolean
	isAtBottom: boolean
	isNearBottom: boolean

	resizeObserver?: ResizeObserver
}

const DEFAULT_SPRING_ANIMATION = {
	damping: 0.7,
	stiffness: 0.05,
	mass: 1.25
}

export type SpringAnimation = Partial<typeof DEFAULT_SPRING_ANIMATION>
export type Animation = ScrollBehavior | SpringAnimation

export interface ScrollElements {
	scrollElement: HTMLElement
	contentElement: HTMLElement
}

export type GetTargetScrollTop = (
	targetScrollTop: number,
	context: ScrollElements
) => number

export interface StickToBottomOptions extends SpringAnimation {
	resize?: Animation
	initial?: Animation | boolean
	targetScrollTop?: GetTargetScrollTop
}

export type ScrollToBottomOptions =
	| ScrollBehavior
	| {
			animation?: Animation
			wait?: boolean | number
			ignoreEscapes?: boolean
			preserveScrollPosition?: boolean
			duration?: number | Promise<void>
	  }
export type ScrollToBottom = (
	opts?: ScrollToBottomOptions
) => Promise<boolean> | boolean
export type StopScroll = () => void

// ---------------------------------------
// Constants & globals
// ---------------------------------------

const STICK_TO_BOTTOM_OFFSET_PX = 70
const SIXTY_FPS_INTERVAL_MS = 1000 / 60
const RETAIN_ANIMATION_DURATION_MS = 350

let mouseDown = false
if (typeof document !== 'undefined') {
	document.addEventListener('mousedown', () => (mouseDown = true))
	document.addEventListener('mouseup', () => (mouseDown = false))
	document.addEventListener('click', () => (mouseDown = false))
}

// ---------------------------------------
// Helpers
// ---------------------------------------

type RefWithCurrent<T> = ((el: T | null) => void) & { current: T | null }

function createRefCallback<T extends HTMLElement>(
	callback: (ref: T | null) => void
): RefWithCurrent<T> {
	const fn = ((ref: T | null) => {
		fn.current = ref
		callback(ref)
	}) as RefWithCurrent<T>
	fn.current = null
	return fn
}

const animationCache = new Map<string, Readonly<Required<SpringAnimation>>>()

function mergeAnimations(...animations: (Animation | boolean | undefined)[]) {
	const result: Required<SpringAnimation> = { ...DEFAULT_SPRING_ANIMATION }
	let instant = false

	for (const animation of animations) {
		if (animation === 'instant') {
			instant = true
			continue
		}
		if (typeof animation !== 'object') continue
		instant = false
		result.damping = animation.damping ?? result.damping
		result.stiffness = animation.stiffness ?? result.stiffness
		result.mass = animation.mass ?? result.mass
	}

	const key = JSON.stringify(result)
	if (!animationCache.has(key)) animationCache.set(key, Object.freeze(result))
	return instant
		? 'instant'
		: (animationCache.get(key) as Readonly<Required<SpringAnimation>>)
}

// ---------------------------------------
// Core hook
// ---------------------------------------

export function useStickToBottom(options: StickToBottomOptions = {}) {
	const optionsRef = createMemo(() => options)

	const [escapedFromLock, setEscapedFromLock] = createSignal(false)
	const [isAtBottom, setIsAtBottom] = createSignal(options.initial !== false)
	const [isNearBottom, setIsNearBottom] = createSignal(false)

	const state: StickToBottomState = {
		resizeDifference: 0,
		accumulated: 0,
		velocity: 0,

		get escapedFromLock() {
			return escapedFromLock()
		},
		set escapedFromLock(v: boolean) {
			setEscapedFromLock(v)
		},
		get isAtBottom() {
			return isAtBottom()
		},
		set isAtBottom(v: boolean) {
			setIsAtBottom(v)
		},
		get scrollTop() {
			return scrollRef.current?.scrollTop ?? 0
		},
		set scrollTop(v: number) {
			if (scrollRef.current) {
				scrollRef.current.scrollTop = v
				state.ignoreScrollToTop = scrollRef.current.scrollTop
			}
		},

		get targetScrollTop() {
			if (!scrollRef.current || !contentRef.current) return 0
			return scrollRef.current.scrollHeight - 1 - scrollRef.current.clientHeight
		},
		get calculatedTargetScrollTop() {
			if (!scrollRef.current || !contentRef.current) return 0
			const target = this.targetScrollTop
			const get = optionsRef().targetScrollTop
			if (!get) return target

			const calculated = Math.max(
				Math.min(
					get(target, {
						scrollElement: scrollRef.current!,
						contentElement: contentRef.current!
					}),
					target
				),
				0
			)
			return calculated
		},
		get scrollDifference() {
			return this.calculatedTargetScrollTop - this.scrollTop
		},
		get isNearBottom() {
			return this.scrollDifference <= STICK_TO_BOTTOM_OFFSET_PX
		}
	}

	// keep derived state in sync with signals when we update them
	const setIsAtBottomInternal = (val: boolean) => {
		state.isAtBottom = val
		setIsAtBottom(val)
	}
	const setEscapedFromLockInternal = (val: boolean) => {
		state.escapedFromLock = val
		setEscapedFromLock(val)
	}

	const isSelecting = () => {
		if (!mouseDown) return false
		const selection = window.getSelection()
		if (!selection || !selection.rangeCount) return false
		const range = selection.getRangeAt(0)
		return (
			!!range.commonAncestorContainer &&
			(scrollRef.current?.contains(range.commonAncestorContainer) ||
				range.commonAncestorContainer?.contains?.(scrollRef.current))
		)
	}

	const scrollToBottom: ScrollToBottom = (scrollOptions = {}) => {
		if (typeof scrollOptions === 'string') {
			scrollOptions = { animation: scrollOptions }
		}

		if (!scrollOptions.preserveScrollPosition) {
			setIsAtBottomInternal(true)
		}

		const waitElapsed = Date.now() + (Number(scrollOptions.wait) || 0)
		const behavior = mergeAnimations(optionsRef(), scrollOptions.animation)
		const { ignoreEscapes = false } = scrollOptions

		let durationElapsed: number
		let startTarget = state.calculatedTargetScrollTop

		if (scrollOptions.duration instanceof Promise) {
			scrollOptions.duration.finally(() => {
				durationElapsed = Date.now()
			})
		} else {
			durationElapsed = waitElapsed + (scrollOptions.duration ?? 0)
		}

		const next = async (): Promise<boolean> => {
			const promise = new Promise<boolean>(resolve => {
				requestAnimationFrame(() => {
					if (!state.isAtBottom) {
						state.animation = undefined
						resolve(false)
						return
					}

					const { scrollTop } = state
					const tick = performance.now()
					const tickDelta =
						(tick - (state.lastTick ?? tick)) / SIXTY_FPS_INTERVAL_MS

					const anim = (state.animation ||= {
						behavior,
						promise: undefined,
						ignoreEscapes
					})

					if (anim.behavior === behavior) {
						state.lastTick = tick
					}

					if (isSelecting()) return resolve(next())
					if (waitElapsed > Date.now()) return resolve(next())

					if (
						scrollTop < Math.min(startTarget, state.calculatedTargetScrollTop)
					) {
						if (state.animation?.behavior === behavior) {
							if (behavior === 'instant') {
								state.scrollTop = state.calculatedTargetScrollTop
								return resolve(next())
							}

							state.velocity =
								(behavior.damping * state.velocity +
									behavior.stiffness * state.scrollDifference) /
								behavior.mass
							state.accumulated += state.velocity * tickDelta
							state.scrollTop += state.accumulated

							if (state.scrollTop !== scrollTop) {
								state.accumulated = 0
							}
						}
						return resolve(next())
					}

					if (durationElapsed > Date.now()) {
						startTarget = state.calculatedTargetScrollTop
						return resolve(next())
					}

					state.animation = undefined

					if (state.scrollTop < state.calculatedTargetScrollTop) {
						return resolve(
							scrollToBottom({
								animation: mergeAnimations(optionsRef(), optionsRef().resize),
								ignoreEscapes,
								duration: Math.max(0, durationElapsed - Date.now()) || undefined
							}) as Promise<boolean>
						)
					}

					resolve(state.isAtBottom)
				})
			})

			return promise.then(val => {
				requestAnimationFrame(() => {
					if (!state.animation) {
						state.lastTick = undefined
						state.velocity = 0
					}
				})
				return val
			})
		}

		if (scrollOptions.wait !== true) {
			state.animation = undefined
		}
		if (state.animation?.behavior === behavior) {
			return state.animation.promise!
		}

		const p = next()
		state.animation = { behavior, ignoreEscapes, promise: p }
		return p
	}

	const stopScroll: StopScroll = () => {
		setEscapedFromLockInternal(true)
		setIsAtBottomInternal(false)
	}

	const handleScroll = (e: Event) => {
		if (e.target !== scrollRef.current) return

		const { scrollTop, ignoreScrollToTop } = state
		let { lastScrollTop = scrollTop } = state
		state.lastScrollTop = scrollTop
		state.ignoreScrollToTop = undefined

		if (ignoreScrollToTop && ignoreScrollToTop > scrollTop) {
			lastScrollTop = ignoreScrollToTop
		}

		setIsNearBottom(state.isNearBottom)

		setTimeout(() => {
			if (state.resizeDifference || scrollTop === ignoreScrollToTop) return

			if (isSelecting()) {
				setEscapedFromLockInternal(true)
				setIsAtBottomInternal(false)
				return
			}

			const isScrollingDown = scrollTop > lastScrollTop
			const isScrollingUp = scrollTop < lastScrollTop

			if (state.animation?.ignoreEscapes) {
				state.scrollTop = lastScrollTop
				return
			}

			if (isScrollingUp) {
				setEscapedFromLockInternal(true)
				setIsAtBottomInternal(false)
			}
			if (isScrollingDown) setEscapedFromLockInternal(false)

			if (!state.escapedFromLock && state.isNearBottom) {
				setIsAtBottomInternal(true)
			}
		}, 1)
	}

	const handleWheel = (e: WheelEvent) => {
		const target = e.target as HTMLElement
		let element: HTMLElement | null = target

		while (
			element &&
			!['scroll', 'auto'].includes(getComputedStyle(element).overflow)
		) {
			element = element.parentElement
			if (!element) return
		}

		if (
			element === scrollRef.current &&
			e.deltaY < 0 &&
			scrollRef.current!.scrollHeight > scrollRef.current!.clientHeight &&
			!state.animation?.ignoreEscapes
		) {
			setEscapedFromLockInternal(true)
			setIsAtBottomInternal(false)
		}
	}

	const scrollRef = createRefCallback<HTMLElement>(scroll => {
		if (scrollRef.current) {
			scrollRef.current.removeEventListener('scroll', handleScroll)
			scrollRef.current.removeEventListener('wheel', handleWheel)
		}
		if (scroll) {
			scroll.addEventListener('scroll', handleScroll, { passive: true })
			scroll.addEventListener('wheel', handleWheel, { passive: true })
			if (getComputedStyle(scroll).overflow === 'visible') {
				scroll.style.overflow = 'auto'
			}
		}
	})

	const contentRef = createRefCallback<HTMLElement>(content => {
		state.resizeObserver?.disconnect()
		if (!content) return

		let previousHeight: number | undefined
		state.resizeObserver = new ResizeObserver(([entry]) => {
			if (!entry) return
			const { height } = entry.contentRect
			const difference = height - (previousHeight ?? height)
			state.resizeDifference = difference

			if (state.scrollTop > state.targetScrollTop) {
				state.scrollTop = state.targetScrollTop
			}

			setIsNearBottom(state.isNearBottom)

			if (difference >= 0) {
				const animation = mergeAnimations(
					optionsRef(),
					previousHeight ? optionsRef().resize : optionsRef().initial
				)
				scrollToBottom({
					animation,
					wait: true,
					preserveScrollPosition: true,
					duration:
						animation === 'instant' ? undefined : RETAIN_ANIMATION_DURATION_MS
				})
			} else {
				if (state.isNearBottom) {
					setEscapedFromLockInternal(false)
					setIsAtBottomInternal(true)
				}
			}

			previousHeight = height

			requestAnimationFrame(() => {
				setTimeout(() => {
					if (state.resizeDifference === difference) state.resizeDifference = 0
				}, 1)
			})
		})
		state.resizeObserver.observe(content)
	})

	onCleanup(() => {
		state.resizeObserver?.disconnect()
		if (scrollRef.current) {
			scrollRef.current.removeEventListener('scroll', handleScroll)
			scrollRef.current.removeEventListener('wheel', handleWheel)
		}
	})

	onMount(() => {
		// Ensure scroll container has overflow set
		if (
			scrollRef.current &&
			getComputedStyle(scrollRef.current).overflow === 'visible'
		) {
			scrollRef.current.style.overflow = 'auto'
		}
	})

	return {
		contentRef,
		scrollRef,
		scrollToBottom,
		stopScroll,
		isAtBottom: () => isAtBottom() || isNearBottom(),
		isNearBottom,
		escapedFromLock,
		state
	}
}

// ---------------------------------------
// Context component API (Solid)
// ---------------------------------------

export interface StickToBottomContext {
	contentRef: RefWithCurrent<HTMLElement>
	scrollRef: RefWithCurrent<HTMLElement>
	scrollToBottom: ScrollToBottom
	stopScroll: StopScroll
	isAtBottom: Accessor<boolean>
	escapedFromLock: Accessor<boolean>
	get targetScrollTop(): GetTargetScrollTop | null
	set targetScrollTop(targetScrollTop: GetTargetScrollTop | null)
	state: StickToBottomState
}

const StickToBottomCtx = createContext<StickToBottomContext | null>(null)

type DivProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'>

export interface StickToBottomProps extends DivProps, StickToBottomOptions {
	instance?: ReturnType<typeof useStickToBottom>
	children: ((ctx: StickToBottomContext) => JSX.Element) | JSX.Element
}

export const StickToBottom: Component<StickToBottomProps> & {
	Content: Component<
		DivProps & {
			children: ((ctx: StickToBottomContext) => JSX.Element) | JSX.Element
		}
	>
} = props => {
	const [p, rest] = splitProps(props, [
		'instance',
		'children',
		'resize',
		'initial',
		'mass',
		'damping',
		'stiffness',
		'targetScrollTop'
	])

	let customTarget: GetTargetScrollTop | null = null

	const defaultInstance = useStickToBottom({
		get mass() {
			return p.mass
		},
		get damping() {
			return p.damping
		},
		get stiffness() {
			return p.stiffness
		},
		get resize() {
			return p.resize
		},
		get initial() {
			return p.initial
		},
		targetScrollTop: (target, els) =>
			customTarget?.(target, els) ?? p.targetScrollTop?.(target, els) ?? target
	})

	const inst = () => p.instance ?? defaultInstance

	const context: StickToBottomContext = {
		scrollToBottom: () => inst().scrollToBottom(),
		stopScroll: () => inst().stopScroll(),
		get scrollRef() {
			return inst().scrollRef
		},
		isAtBottom: () => inst().isAtBottom(),
		escapedFromLock: () => inst().escapedFromLock(),
		get contentRef() {
			return inst().contentRef
		},
		get state() {
			return inst().state
		},
		get targetScrollTop() {
			return customTarget
		},
		set targetScrollTop(v: GetTargetScrollTop | null) {
			customTarget = v
		}
	}

	onMount(() => {
		// Ensure overflow is set for scroll container
		if (
			inst().scrollRef.current &&
			getComputedStyle(inst().scrollRef.current!).overflow === 'visible'
		) {
			inst().scrollRef.current!.style.overflow = 'auto'
		}
	})

	return (
		<StickToBottomCtx.Provider value={context}>
			<div {...rest}>
				{typeof p.children === 'function' ? p.children(context) : p.children}
			</div>
		</StickToBottomCtx.Provider>
	)
}

StickToBottom.Content = props => {
	const ctx = useStickToBottomContext()
	const [p, rest] = splitProps(props, ['children'])

	return (
		<div
			ref={ctx.scrollRef}
			style={{ height: '100%', width: '100%', overflow: 'auto' }}
		>
			<div {...rest} ref={ctx.contentRef}>
				{typeof p.children === 'function' ? p.children(ctx) : p.children}
			</div>
		</div>
	)
}

export function useStickToBottomContext(): StickToBottomContext {
	const ctx = useContext(StickToBottomCtx)
	if (!ctx)
		throw new Error(
			'useStickToBottomContext must be used within <StickToBottom>'
		)
	return ctx
}
