import { createEffect, createSignal, on, type Accessor } from 'solid-js'
import { useCursor } from '../cursor'
import { getMinimapLayout } from './minimapUtils'
import { useScrollState } from './ScrollState'
import type { MinimapProps } from './types'
import { useMinimapResize } from './useMinimapResize'
import { useMinimapScroll } from './useMinimapScroll'
import { useMinimapWidth } from './useMinimapWidth'
import { useMinimapWorker } from './useMinimapWorker'
import { useTheme } from '@repo/theme'
import { createMinimapPalette, hexToPacked } from './minimapUtils'

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
	/** Background color from theme */
	backgroundColor: Accessor<string>
	/** Whether dark mode is active */
	isDark: Accessor<boolean>
}

export const useMinimapCore = (
	props: UseMinimapCoreOptions,
	onOverlayRender?: () => void
): MinimapCoreController => {
	const cursor = useCursor()
	const { setScrollElement, setLineCount, setContainerHeight } =
		useScrollState()
	const { theme, isDark } = useTheme()

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

	const worker = useMinimapWorker({
		onReady: () => setWorkerActive(true),
		onError: () => {
			setWorkerActive(false)
		},
	})

	createEffect(() => {
		const element = props.scrollElement()
		if (element) {
			setScrollElement(element)
		}
	})

	createEffect(() => {
		setLineCount(cursor.lines.lineCount())
	})

	createEffect(() => {
		const cont = container()
		if (cont) {
			setContainerHeight(cont.clientHeight)
		}
	})

	let workerInitialized = false
	createEffect(() => {
		const canvas = baseCanvas()
		const cont = container()
		if (!canvas || !cont || workerInitialized) return

		const layout = getMinimapLayout(cont)
		if (!layout) return

		workerInitialized = true
		const bgColor = hexToPacked(theme.editor.background)
		void worker.init(canvas, layout, createMinimapPalette(theme), bgColor)
	})

	createEffect(() => {
		if (!workerActive()) return
		const palette = createMinimapPalette(theme)
		const bgColor = hexToPacked(theme.editor.background)
		void worker.updatePalette(palette, bgColor)
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

				let rendered = await worker.renderFromPath(filePath, version ?? 0)

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

	useMinimapScroll({
		scrollElement: props.scrollElement,
		container,
		lineCount: cursor.lines.lineCount,
		worker,
		onScroll: onOverlayRender,
	})

	const backgroundColor = () => theme.editor.background

	return {
		container,
		setContainer,
		baseCanvas,
		setBaseCanvas,
		minimapWidthCss,
		overlayVisible,
		backgroundColor,
		isDark,
	}
}
