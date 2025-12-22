/**
 * Hook for minimap scroll synchronization.
 * Syncs editor scroll position to minimap worker.
 */

import { createEffect, onCleanup, type Accessor } from 'solid-js'
import { MINIMAP_ROW_HEIGHT_CSS } from './constants'
import { getMinimapScrollState } from './scrollUtils'
import type { MinimapWorkerController } from './useMinimapWorker'

export type UseMinimapScrollOptions = {
	/** Scroll element to observe */
	scrollElement: Accessor<HTMLElement | null>
	/** Container element for height calculation */
	container: Accessor<HTMLDivElement | null>
	/** Line count accessor */
	lineCount: Accessor<number>
	/** Worker controller */
	worker: MinimapWorkerController
	/** Callback on scroll */
	onScroll?: () => void
}

/**
 * Syncs scroll position to minimap worker with RAF batching.
 */
export const useMinimapScroll = (options: UseMinimapScrollOptions): void => {
	const { scrollElement, container, lineCount, worker, onScroll } = options

	createEffect(() => {
		const element = scrollElement()
		if (!element) return

		let rafScrollSync = 0
		let pendingWorkerScrollY: number | null = null

		const handleScroll = () => {
			onScroll?.()

			// Sync scroll to worker
			const host = container()
			if (host) {
				const rect = host.getBoundingClientRect()
				const minimapHeight = rect.height
				const totalMinimapHeight = lineCount() * MINIMAP_ROW_HEIGHT_CSS

				const { minimapScrollTop } = getMinimapScrollState(
					element,
					minimapHeight,
					totalMinimapHeight
				)

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
			if (rafScrollSync) {
				cancelAnimationFrame(rafScrollSync)
				rafScrollSync = 0
			}
			pendingWorkerScrollY = null
		})
	})
}
