/**
 * Hook for minimap container resize handling.
 * Observes container size and updates worker layout.
 */

import { createResizeObserver } from '@solid-primitives/resize-observer'
import { createEffect, untrack, type Accessor } from 'solid-js'
import { getMinimapLayout } from './minimapUtils'
import type { MinimapWorkerController } from './useMinimapWorker'

export type UseMinimapResizeOptions = {
	/** Container element accessor */
	container: Accessor<HTMLDivElement | null>
	/** Worker controller */
	worker: MinimapWorkerController
	/** Current file path for re-render on resize */
	filePath?: string
	/** Version accessor */
	version?: Accessor<number>
	/** Whether base has been rendered */
	hasRenderedBase: () => boolean
	/** Callback when resize completes */
	onResize?: () => void
}

export type MinimapResizeController = {
	/** Whether container has been measured */
	hasMeasuredSize: () => boolean
}

/**
 * Handles container resize and updates worker layout.
 */
export const useMinimapResize = (
	options: UseMinimapResizeOptions
): MinimapResizeController => {
	const { container, worker, filePath, version, hasRenderedBase, onResize } =
		options

	let hasMeasuredSize = false

	const handleMinimapResize = () => {
		hasMeasuredSize = true
		const layout = getMinimapLayout(container())
		if (layout) {
			void worker.updateLayout(layout)

			// Re-render base layer after resize if we already have content
			const ver = version?.() ?? 0
			if (hasRenderedBase() && filePath) {
				void worker.renderFromPath(filePath, ver)
			}
		}

		onResize?.()
	}

	// Run one initial measurement once the container ref exists
	createEffect(() => {
		if (!container()) return
		untrack(handleMinimapResize)
	})
	createResizeObserver(container, handleMinimapResize)

	return {
		hasMeasuredSize: () => hasMeasuredSize,
	}
}
