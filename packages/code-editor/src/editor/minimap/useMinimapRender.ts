/**
 * Hook for minimap render orchestration.
 * Connects tree-sitter worker and manages rendering lifecycle.
 */

import { createEffect, on, type Accessor } from 'solid-js'
import type { MinimapWorkerController } from './useMinimapWorker'

export type UseMinimapRenderOptions = {
	/** Worker controller */
	worker: MinimapWorkerController
	/** Whether worker is active */
	workerActive: Accessor<boolean>
	/** Tree-sitter worker for syntax highlighting (accessed reactively) */
	treeSitterWorker?: Worker
	/** File path to render */
	filePath?: string
	/** Document version */
	version?: Accessor<number>
	/** File content for fallback rendering */
	content?: Accessor<string>
	/** Whether container has been measured */
	hasMeasuredSize: Accessor<boolean>
	/** Overlay visibility state */
	overlayVisible: Accessor<boolean>
	/** Set has rendered base state */
	setHasRenderedBase: (v: boolean) => void
	/** Set overlay visibility */
	setOverlayVisible: (v: boolean) => void
	/** Callback when render completes */
	onRenderComplete?: () => void
}

/**
 * Orchestrates minimap rendering with tree-sitter integration.
 */
export const useMinimapRender = (options: UseMinimapRenderOptions): void => {
	// DON'T destructure treeSitterWorker - it breaks reactivity!
	// Access options.treeSitterWorker directly in the effect
	const {
		worker,
		workerActive,
		filePath,
		version,
		content,
		hasMeasuredSize,
		overlayVisible,
		setHasRenderedBase,
		setOverlayVisible,
		onRenderComplete,
	} = options

	let connectedTreeSitterWorker: Worker | null = null
	let lastRenderedPath: string | null = null

	// Connect tree-sitter and render when inputs change
	createEffect(
		on(
			() =>
				[
					workerActive(),
					options.treeSitterWorker, // Access from options for reactivity
					filePath,
					version?.(),
					content?.(),
				] as const,
			async ([active, tsWorker, path, ver, text]) => {
				if (!active) return

				// Connect tree-sitter if changed
				if (tsWorker && connectedTreeSitterWorker !== tsWorker) {
					worker.connectTreeSitter(tsWorker)
					connectedTreeSitterWorker = tsWorker
				}

				// Clear if no tree-sitter or file path
				if (!tsWorker || !path) {
					setHasRenderedBase(false)
					lastRenderedPath = null
					setOverlayVisible(false)
					await worker.clear()
					return
				}

				// Handle path changes
				const isNewPath = lastRenderedPath !== path
				if (isNewPath) {
					setHasRenderedBase(false)
					setOverlayVisible(false)
					lastRenderedPath = path
					await worker.clear()
				}

				// Try path-based render first
				let rendered = await worker.renderFromPath(path, ver ?? 0)

				// Fallback to text-based render
				if (!rendered && text) {
					rendered = await worker.renderFromText(text, ver ?? 0)
				}

				if (!rendered) {
					return
				}

				setHasRenderedBase(true)
				if (hasMeasuredSize() && !overlayVisible()) {
					setOverlayVisible(true)
				}
				if (overlayVisible()) onRenderComplete?.()
			},
			{ defer: true }
		)
	)
}
