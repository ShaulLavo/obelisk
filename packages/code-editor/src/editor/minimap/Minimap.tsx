import { AutoHideVisibility, AutoHideWrapper } from '@repo/ui/auto-hide-wrapper'
import { createResizeObserver } from '@solid-primitives/resize-observer'
import { clsx } from 'clsx'
import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
	untrack,
} from 'solid-js'
import { useCursor } from '../cursor'
import {
	MINIMAP_MAX_CHARS,
	MINIMAP_MAX_WIDTH_CSS,
	MINIMAP_MIN_WIDTH_CSS,
	MINIMAP_PADDING_X_CSS,
	MINIMAP_ROW_HEIGHT_CSS,
	MINIMAP_WIDTH_RATIO,
} from './constants'
import { Scrollbar } from './Scrollbar'
import { ScrollStateProvider, useScrollState } from './ScrollState'
import { computeScrollOffset, getMinimapScrollState } from './scrollUtils'
import type { MinimapProps } from './types'
import { useMinimapInteraction } from './useMinimapInteraction'
import { useMinimapWorker } from './useMinimapWorker'
import type { MinimapLayout } from './workerTypes'

const MINIMAP_VISIBILITY = AutoHideVisibility.SHOW

/**
 * Minimap Component
 *
 * The base canvas is transferred to the minimap worker and rendered entirely off the main thread.
 * The overlay canvas stays on the main thread for fast cursor/selection updates.
 */
export const Minimap = (props: MinimapProps) => {
	const cursor = useCursor()

	const [container, setContainer] = createSignal<HTMLDivElement | null>(null)
	const [baseCanvas, setBaseCanvas] = createSignal<HTMLCanvasElement | null>(
		null
	)
	const [overlayCanvas, setOverlayCanvas] =
		createSignal<HTMLCanvasElement | null>(null)
	const [overlayVisible, setOverlayVisible] = createSignal(false)
	const [isDragging, setIsDragging] = createSignal(false)
	const [minimapWidthCss, setMinimapWidthCss] = createSignal(
		MINIMAP_MIN_WIDTH_CSS
	)
	// Worker manages the base canvas rendering
	const [workerActive, setWorkerActive] = createSignal(false)
	const worker = useMinimapWorker({
		onReady: () => setWorkerActive(true),
		onError: (error) => {
			console.warn('Minimap worker error:', error)
			setWorkerActive(false)
		},
	})

	let rafOverlay = 0
	let rafScrollSync = 0
	let pendingWorkerScrollY: number | null = null
	let connectedTreeSitterWorker: Worker | null = null
	let hasMeasuredSize = false
	let hasRenderedBase = false
	let lastRenderedPath: string | null = null

	let dragState:
		| {
				pointerId: number
				dragOffsetY: number
				sliderHeight: number
		  }
		| undefined

	const getCanvasSizeCss = () => {
		const host = container()
		if (!host) return null
		const rect = host.getBoundingClientRect()
		const width = Math.max(1, Math.round(rect.width))
		const height = Math.max(1, Math.round(rect.height))
		return { width, height }
	}

	const syncCanvasDpr = (
		canvas: HTMLCanvasElement,
		width: number,
		height: number
	) => {
		const dpr = window.devicePixelRatio || 1
		const deviceWidth = Math.max(1, Math.round(width * dpr))
		const deviceHeight = Math.max(1, Math.round(height * dpr))
		if (canvas.width !== deviceWidth) canvas.width = deviceWidth
		if (canvas.height !== deviceHeight) canvas.height = deviceHeight
		return { dpr, deviceWidth, deviceHeight }
	}

	const getLayout = (): MinimapLayout | null => {
		const size = getCanvasSizeCss()
		if (!size) return null

		const dpr = window.devicePixelRatio || 1
		return {
			mode: 'blocks',
			minimapLineHeightCss: MINIMAP_ROW_HEIGHT_CSS,
			maxChars: MINIMAP_MAX_CHARS,
			paddingXCss: MINIMAP_PADDING_X_CSS,
			size: {
				cssWidth: size.width,
				cssHeight: size.height,
				dpr,
				deviceWidth: Math.round(size.width * dpr),
				deviceHeight: Math.round(size.height * dpr),
			},
		}
	}

	const scheduleOverlayRender = () => {
		if (rafOverlay) cancelAnimationFrame(rafOverlay)
		rafOverlay = requestAnimationFrame(() => {
			rafOverlay = 0
			renderOverlay()
		})
	}

	// Initialize worker and transfer base canvas
	onMount(async () => {
		const canvas = baseCanvas()
		if (!canvas) return

		const layout = getLayout()
		if (!layout) return

		const success = await worker.init(canvas, layout)
		if (!success) return
	})

	const computeMinimapWidthCss = (editorWidth: number) => {
		const raw = Math.round(editorWidth / MINIMAP_WIDTH_RATIO)
		return Math.max(MINIMAP_MIN_WIDTH_CSS, Math.min(MINIMAP_MAX_WIDTH_CSS, raw))
	}

	const widthMeasureTarget = () => {
		const scrollHost = props.scrollElement()
		return scrollHost?.parentElement ?? scrollHost
	}

	const updateMinimapWidth = () => {
		const target = widthMeasureTarget()
		if (!target) return

		const width = Math.max(1, Math.round(target.getBoundingClientRect().width))
		setMinimapWidthCss(computeMinimapWidthCss(width))
	}

	createEffect(updateMinimapWidth)
	createResizeObserver(widthMeasureTarget, updateMinimapWidth)

	const handleMinimapResize = () => {
		hasMeasuredSize = true
		const layout = getLayout()
		if (layout) {
			void worker.updateLayout(layout)

			// Re-render base layer after resize if we already have content
			const filePath = props.filePath
			const version = props.version?.() ?? 0
			if (hasRenderedBase && filePath) {
				void worker.renderFromPath(filePath, version)
			}
		}

		if (hasRenderedBase && overlayVisible() === false) {
			setOverlayVisible(true)
		}
		if (overlayVisible()) {
			scheduleOverlayRender()
		}
	}

	// Run one initial measurement once the container ref exists; ResizeObserver only reacts to subsequent size changes.
	createEffect(() => {
		if (!container()) return
		untrack(handleMinimapResize)
	})
	createResizeObserver(container, handleMinimapResize)

	// Side-effect orchestration: connect tree-sitter + (re)render when worker/file/version/content inputs change.
	createEffect(
		on(
			() =>
				[
					workerActive(),
					props.treeSitterWorker,
					props.filePath,
					props.version?.(),
					props.content?.(),
				] as const,
			async ([active, treeSitterWorker, filePath, version, content]) => {
				if (!active) return

				if (
					treeSitterWorker &&
					connectedTreeSitterWorker !== treeSitterWorker
				) {
					worker.connectTreeSitter(treeSitterWorker)
					connectedTreeSitterWorker = treeSitterWorker
				}

				if (!treeSitterWorker || !filePath) {
					hasRenderedBase = false
					lastRenderedPath = null
					setOverlayVisible(false)
					await worker.clear()
					return
				}

				const isNewPath = lastRenderedPath !== filePath
				if (isNewPath) {
					hasRenderedBase = false
					setOverlayVisible(false)
					lastRenderedPath = filePath
					await worker.clear()
				}

				// Try path-based render first (uses tree-sitter cache with syntax highlighting)
				let rendered = await worker.renderFromPath(filePath, version ?? 0)

				// Fallback to text-based render for unsupported languages
				if (!rendered && content) {
					rendered = await worker.renderFromText(content, version ?? 0)
				}

				if (!rendered) return

				hasRenderedBase = true
				if (hasMeasuredSize && overlayVisible() === false) {
					setOverlayVisible(true)
				}
				if (overlayVisible()) scheduleOverlayRender()
			},
			{ defer: true }
		)
	)

	// Overlay rendering (cursor, selections, diagnostics) stays on main thread
	const renderOverlay = () => {
		const element = props.scrollElement()
		const canvas = overlayCanvas()
		if (!element || !canvas) return

		const size = getCanvasSizeCss()
		if (!size) return

		const { width, height: containerHeight } = size
		const { dpr, deviceWidth, deviceHeight } = syncCanvasDpr(
			canvas,
			width,
			containerHeight
		)

		const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
		if (!ctx) return

		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, deviceWidth, deviceHeight)

		const lineCount = cursor.lines.lineCount()
		if (lineCount <= 0) return

		const totalMinimapHeight = lineCount * MINIMAP_ROW_HEIGHT_CSS

		const { sliderTop, sliderHeight } = getMinimapScrollState(
			element,
			containerHeight, // The visible height of the minimap container
			totalMinimapHeight
		)

		const sliderXCss = 1
		const sliderWidthCss = Math.max(1, width - 2)

		const x = sliderXCss * dpr
		const y = sliderTop * dpr
		const w = sliderWidthCss * dpr
		const h = sliderHeight * dpr

		ctx.fillStyle = 'rgba(228, 228, 231, 0.10)'
		ctx.fillRect(x, y, w, h)

		ctx.strokeStyle = 'rgba(228, 228, 231, 0.28)'
		ctx.lineWidth = Math.max(1, Math.round(1 * dpr))
		ctx.strokeRect(x, y, w, h)

		const scale = Math.round(dpr)
		const rowHeightDevice = MINIMAP_ROW_HEIGHT_CSS * scale

		// CRITICAL: Use computeScrollOffset which matches the worker's formula
		// so that selection/cursor positions align with the base canvas content
		const scrollOffset = computeScrollOffset(
			element,
			lineCount,
			deviceHeight,
			scale
		)

		// Helper to convert model line to minimap Y position
		// This projects the line onto the CANVAS, applying scroll
		const lineToMinimapY = (line: number) => {
			const absoluteY = line * rowHeightDevice
			return absoluteY - scrollOffset
		}

		// Draw cursor line highlight
		const cursorLine = cursor.state.position.line
		const cursorY = lineToMinimapY(cursorLine)
		const cursorHeight = Math.max(1, rowHeightDevice)

		// Only draw if visible
		if (cursorY + cursorHeight >= 0 && cursorY < deviceHeight) {
			ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
			ctx.fillRect(x, cursorY, w, cursorHeight)
		}

		// Draw selection ranges - more prominent
		const selections = cursor.state.selections
		if (selections && selections.length > 0) {
			ctx.fillStyle = 'rgba(59, 130, 246, 0.5)' // Blue-500 with higher opacity

			for (const selection of selections) {
				// SelectionRange uses anchor/focus offsets, not line/column positions
				if (selection.anchor === selection.focus) {
					continue // Skip empty selections
				}

				const startOffset = Math.min(selection.anchor, selection.focus)
				const endOffset = Math.max(selection.anchor, selection.focus)

				const startPos = cursor.lines.offsetToPosition(startOffset)
				const endPos = cursor.lines.offsetToPosition(endOffset)

				const startLine = startPos.line
				const endLine = endPos.line

				const selectionStartY = lineToMinimapY(startLine)
				const selectionEndY = lineToMinimapY(endLine + 1)
				const selectionHeight = Math.max(
					cursorHeight,
					selectionEndY - selectionStartY
				)

				ctx.fillRect(x, selectionStartY, w, selectionHeight)
			}
		}

		// Draw diagnostic markers - FULL WIDTH red/yellow lines with emphasis
		const errors = props.errors?.()
		if (errors && errors.length > 0) {
			for (const error of errors) {
				const errorLine = cursor.lines.offsetToPosition(error.startIndex).line
				const errorY = lineToMinimapY(errorLine)

				// Use red for errors, yellow for warnings - HIGH VISIBILITY
				const isWarning = error.isMissing
				ctx.fillStyle = isWarning
					? 'rgba(250, 204, 21, 0.85)' // yellow-400
					: 'rgba(239, 68, 68, 0.9)' // red-500

				// Full width line with extra height for visibility
				const errorHeight = Math.max(cursorHeight, 3 * dpr)
				ctx.fillRect(x, errorY, w, errorHeight)

				// Add bright outline for extra emphasis
				ctx.strokeStyle = isWarning
					? 'rgba(234, 179, 8, 1)' // yellow-500 solid
					: 'rgba(220, 38, 38, 1)' // red-600 solid
				ctx.lineWidth = Math.max(1, dpr)
				ctx.strokeRect(x, errorY, w, errorHeight)
			}
		}
	}

	// Re-render overlay when cursor, selection, or errors change
	createEffect(
		on(
			() => [
				cursor.state.position.line,
				cursor.state.selections,
				props.errors?.(),
			],
			() => scheduleOverlayRender()
		)
	)

	// Re-render overlay and sync worker on scroll
	createEffect(() => {
		const element = props.scrollElement()
		if (!element) return

		const handleScroll = () => {
			scheduleOverlayRender()

			// Sync scroll to worker
			const host = container()
			if (host) {
				const rect = host.getBoundingClientRect()
				const minimapHeight = rect.height
				const lineCount = cursor.lines.lineCount()
				const totalMinimapHeight = lineCount * MINIMAP_ROW_HEIGHT_CSS

				const { minimapScrollTop } = getMinimapScrollState(
					element,
					minimapHeight,
					totalMinimapHeight
				)

				// Use Math.round(dpr) to match the worker's scale calculation
				const dpr = window.devicePixelRatio || 1
				const scale = Math.round(dpr)
				pendingWorkerScrollY = Math.max(0, Math.round(minimapScrollTop * scale))
				if (!rafScrollSync) {
					rafScrollSync = requestAnimationFrame(() => {
						rafScrollSync = 0
						if (pendingWorkerScrollY === null) return
						void worker.updateScroll(pendingWorkerScrollY)
						pendingWorkerScrollY = null
					})
				}
			}
		}
		element.addEventListener('scroll', handleScroll, { passive: true })
		handleScroll()

		onCleanup(() => {
			element.removeEventListener('scroll', handleScroll)
		})
	})

	// Pointer event handlers for slider interaction
	const handlePointerDown = (event: PointerEvent) => {
		// Prevent default to preserve editor selection when clicking minimap
		event.preventDefault()

		const element = props.scrollElement()
		if (!element) return

		const size = getCanvasSizeCss()
		if (!size) return

		const lineCount = cursor.lines.lineCount()
		const totalMinimapHeight = lineCount * MINIMAP_ROW_HEIGHT_CSS

		const { minimapScrollTop, sliderTop, sliderHeight } = getMinimapScrollState(
			element,
			size.height,
			totalMinimapHeight
		)
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
		const localY = Math.max(0, Math.min(size.height, event.clientY - rect.top))
		const isOnSlider = localY >= sliderTop && localY <= sliderTop + sliderHeight

		if (isOnSlider) {
			dragState = {
				pointerId: event.pointerId,
				dragOffsetY: localY - sliderTop,
				sliderHeight,
			}
			;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
			setIsDragging(true)
		} else {
			// Click outside slider - jump to the exact text clicked
			// The clicked position on the minimap represents: minimapScrollTop + localY (in CSS pixels)
			// Convert to a line number, then scroll to center that line in the editor
			const clickedMinimapY = minimapScrollTop + localY
			const clickedLine = Math.floor(clickedMinimapY / MINIMAP_ROW_HEIGHT_CSS)

			// Get the Y position of that line in the editor
			// Approximate: each line height in editor is roughly scrollHeight / lineCount
			const editorLineHeight = element.scrollHeight / lineCount
			const targetY = clickedLine * editorLineHeight

			// Put the clicked line at the top of the viewport
			const clientHeight = element.clientHeight
			const scrollHeight = element.scrollHeight
			const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

			element.scrollTop = Math.max(0, Math.min(maxScrollTop, targetY))
		}
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (!dragState || event.pointerId !== dragState.pointerId) return

		const element = props.scrollElement()
		if (!element) return

		const size = getCanvasSizeCss()
		if (!size) return

		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()

		// For dragging, we use the slider position to determine scroll ratio:
		// sliderTop / (minimapHeight - sliderHeight) = scrollRatio
		// This gives 1-to-1 behavior: moving slider from top to bottom scrolls entire document

		const localY = Math.max(0, Math.min(size.height, event.clientY - rect.top))
		const newSliderTop = localY - dragState.dragOffsetY

		const minimapHeight = size.height
		const maxSliderTop = Math.max(0, minimapHeight - dragState.sliderHeight)
		const ratio = maxSliderTop > 0 ? newSliderTop / maxSliderTop : 0

		const scrollHeight = element.scrollHeight
		const clientHeight = element.clientHeight
		const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

		element.scrollTop = Math.max(
			0,
			Math.min(maxScrollTop, ratio * maxScrollTop)
		)
	}

	const handlePointerUp = (event: PointerEvent) => {
		if (dragState && event.pointerId === dragState.pointerId) {
			;(event.currentTarget as HTMLElement).releasePointerCapture(
				event.pointerId
			)
			dragState = undefined
			setIsDragging(false)
		}
	}

	const handleWheel = (event: WheelEvent) => {
		event.preventDefault()
		const element = props.scrollElement()
		if (element) {
			element.scrollTop += event.deltaY
		}
	}

	onCleanup(() => {
		if (rafOverlay) cancelAnimationFrame(rafOverlay)
		if (rafScrollSync) cancelAnimationFrame(rafScrollSync)
	})

	const computedVisibility = () =>
		isDragging() ? AutoHideVisibility.SHOW : MINIMAP_VISIBILITY

	return (
		<ScrollStateProvider>
			<MinimapContent
				{...props}
				container={container}
				setContainer={setContainer}
				minimapWidthCss={minimapWidthCss}
				computedVisibility={computedVisibility}
				isDragging={isDragging}
				handlePointerDown={handlePointerDown}
				handlePointerMove={handlePointerMove}
				handlePointerUp={handlePointerUp}
				handleWheel={handleWheel}
				baseCanvas={baseCanvas}
				setBaseCanvas={setBaseCanvas}
				overlayCanvas={overlayCanvas}
				setOverlayCanvas={setOverlayCanvas}
			/>
		</ScrollStateProvider>
	)
}

// Inner component that consumes scroll context
const MinimapContent = (
	props: MinimapProps & {
		container: () => HTMLDivElement | null
		setContainer: (el: HTMLDivElement | null) => void
		minimapWidthCss: () => number
		computedVisibility: () => AutoHideVisibility
		isDragging: () => boolean
		handlePointerDown: (e: PointerEvent) => void
		handlePointerMove: (e: PointerEvent) => void
		handlePointerUp: (e: PointerEvent) => void
		handleWheel: (e: WheelEvent) => void
		baseCanvas: () => HTMLCanvasElement | null
		setBaseCanvas: (el: HTMLCanvasElement | null) => void
		overlayCanvas: () => HTMLCanvasElement | null
		setOverlayCanvas: (el: HTMLCanvasElement | null) => void
	}
) => {
	const { setScrollElement, setLineCount, setContainerHeight } =
		useScrollState()
	const cursor = useCursor()

	// Connect scroll element to shared state
	createEffect(() => {
		const element = props.scrollElement()
		if (element) {
			setScrollElement(element)
		}
	})

	// Update line count
	createEffect(() => {
		setLineCount(cursor.lines.lineCount())
	})

	// Update container height
	createEffect(() => {
		const cont = props.container()
		if (cont) {
			setContainerHeight(cont.clientHeight)
		}
	})

	return (
		<>
			<AutoHideWrapper
				visibility={props.computedVisibility()}
				class={clsx(
					"absolute right-[14px] top-0 h-full z-50 group before:absolute before:-left-1 before:top-0 before:h-full before:w-[4px] before:content-[''] border-l border-white/5",
					props.computedVisibility() === AutoHideVisibility.SHOW
						? 'bg-zinc-950/90'
						: 'bg-zinc-950/20 hover:bg-zinc-950/90'
				)}
				style={{
					'view-transition-name': 'minimap',
					width: `${props.minimapWidthCss()}px`,
				}}
				ref={props.setContainer}
				onPointerDown={props.handlePointerDown}
				onPointerMove={props.handlePointerMove}
				onPointerUp={props.handlePointerUp}
				onPointerCancel={props.handlePointerUp}
				onLostPointerCapture={props.handlePointerUp}
				onWheel={props.handleWheel}
			>
				<canvas
					ref={props.setBaseCanvas}
					class="absolute left-0 top-0 h-full w-full"
					style={{
						'pointer-events': 'none',
					}}
				/>
				<canvas
					ref={props.setOverlayCanvas}
					class="absolute left-0 top-0 h-full w-full"
					style={{
						'pointer-events': 'none',
					}}
				/>
			</AutoHideWrapper>
			{/* Scrollbar positioned to the right of minimap */}
			<Scrollbar class="absolute right-0 top-0 h-full z-50" />
		</>
	)
}
