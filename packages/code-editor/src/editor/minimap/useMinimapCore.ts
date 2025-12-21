/**
 * Core hook for minimap orchestration.
 * Composes smaller focused hooks and manages worker initialization.
 *
 * NOTE: The render effect is kept inline here because Solid.js props
 * lose reactivity when passed through intermediate options objects.
 */

import { createEffect, createSignal, on, type Accessor } from 'solid-js'
import { useCursor } from '../cursor'
import { getMinimapLayout } from './minimapUtils'
import { useScrollState } from './ScrollState'
import type { MinimapProps } from './types'
import { useMinimapResize } from './useMinimapResize'
import { useMinimapScroll } from './useMinimapScroll'
import { useMinimapWidth } from './useMinimapWidth'
import { useMinimapWorker } from './useMinimapWorker'

export type UseMinimapCoreOptions = MinimapProps

export type MinimapCoreController = {
	/** Container ref setter */
	setContainer: (el: HTMLDivElement | null) => void
	/** Container accessor */
	container: Accessor<HTMLDivElement | null>
	/** Base canvas ref setter */
	setBaseCanvas: (el: HTMLCanvasElement | null) => void
	/** Base canvas accessor */
	baseCanvas: Accessor<HTMLCanvasElement | null>
	/** Minimap width in CSS pixels */
	minimapWidthCss: Accessor<number>
	/** Whether overlay should be visible */
	overlayVisible: Accessor<boolean>
}

/**
 * Creates the core minimap orchestration logic.
 * Composes width, resize, and scroll hooks.
 */
export const useMinimapCore = (
	props: UseMinimapCoreOptions,
	onOverlayRender?: () => void
): MinimapCoreController => {
	const cursor = useCursor()
	const { setScrollElement, setLineCount, setContainerHeight } =
		useScrollState()

	const [container, setContainer] = createSignal<HTMLDivElement | null>(null)
	const [baseCanvas, setBaseCanvas] = createSignal<HTMLCanvasElement | null>(
		null
	)
	const [workerActive, setWorkerActive] = createSignal(false)
	const [hasMeasuredSize, setHasMeasuredSize] = createSignal(false)
	const [overlayVisible, setOverlayVisible] = createSignal(false)

	let connectedTreeSitterWorker: Worker | null = null
	let hasRenderedBase = false
	let lastRenderedPath: string | null = null

	// Initialize worker
	const worker = useMinimapWorker({
		onReady: () => setWorkerActive(true),
		onError: (error) => {
			console.warn('Minimap worker error:', error)
			setWorkerActive(false)
		},
	})

	// Connect scroll element to shared state
	createEffect(() => {
		const element = props.scrollElement()
		if (element) {
			setScrollElement(element)
		}
	})

	// Update line count in shared state
	createEffect(() => {
		setLineCount(cursor.lines.lineCount())
	})

	// Update container height in shared state
	createEffect(() => {
		const cont = container()
		if (cont) {
			setContainerHeight(cont.clientHeight)
		}
	})

	// Initialize worker when canvas and container are ready
	let workerInitialized = false
	createEffect(() => {
		const canvas = baseCanvas()
		const cont = container()
		if (!canvas || !cont || workerInitialized) return

		const layout = getMinimapLayout(cont)
		if (!layout) return

		workerInitialized = true
		void worker.init(canvas, layout)
	})

	// Width calculation
	const { minimapWidthCss } = useMinimapWidth({
		scrollElement: props.scrollElement,
	})

	// Container resize handling
	useMinimapResize({
		container,
		worker,
		filePath: props.filePath,
		version: props.version,
		hasRenderedBase: () => hasRenderedBase,
		onResize: () => {
			setHasMeasuredSize(true)
			if (hasRenderedBase && !overlayVisible()) {
				setOverlayVisible(true)
			}
			if (overlayVisible()) {
				onOverlayRender?.()
			}
		},
	})

	// Render orchestration - INLINE to preserve props reactivity
	createEffect(
		on(
			() =>
				[
					workerActive(),
					props.treeSitterWorker, // Access props directly for reactivity
					props.filePath,
					props.version?.(),
					props.content?.(),
				] as const,
			async ([active, treeSitterWorker, filePath, version, content]) => {
				if (!active) return

				// Connect tree-sitter if changed
				if (
					treeSitterWorker &&
					connectedTreeSitterWorker !== treeSitterWorker
				) {
					worker.connectTreeSitter(treeSitterWorker)
					connectedTreeSitterWorker = treeSitterWorker
				}

				// Clear if no tree-sitter or file path
				if (!treeSitterWorker || !filePath) {
					hasRenderedBase = false
					lastRenderedPath = null
					setOverlayVisible(false)
					await worker.clear()
					return
				}

				// Handle path changes
				const isNewPath = lastRenderedPath !== filePath
				if (isNewPath) {
					hasRenderedBase = false
					setOverlayVisible(false)
					lastRenderedPath = filePath
					await worker.clear()
				}

				// Try path-based render first
				let rendered = await worker.renderFromPath(filePath, version ?? 0)

				// Fallback to text-based render
				if (!rendered && content) {
					rendered = await worker.renderFromText(content, version ?? 0)
				}

				if (!rendered) return

				hasRenderedBase = true
				if (hasMeasuredSize() && !overlayVisible()) {
					setOverlayVisible(true)
				}
				if (overlayVisible()) onOverlayRender?.()
			},
			{ defer: true }
		)
	)

	// Scroll synchronization
	useMinimapScroll({
		scrollElement: props.scrollElement,
		container,
		lineCount: cursor.lines.lineCount,
		worker,
		onScroll: onOverlayRender,
	})

	return {
		container,
		setContainer,
		baseCanvas,
		setBaseCanvas,
		minimapWidthCss,
		overlayVisible,
	}
}
