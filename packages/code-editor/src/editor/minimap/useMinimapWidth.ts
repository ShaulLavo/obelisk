/**
 * Hook for minimap width calculation.
 * Observes editor width and computes responsive minimap width.
 */

import { createResizeObserver } from '@solid-primitives/resize-observer'
import { createEffect, createSignal, type Accessor } from 'solid-js'
import { MINIMAP_MIN_WIDTH_CSS } from './constants'
import { computeMinimapWidthCss } from './minimapUtils'

export type UseMinimapWidthOptions = {
	/** Scroll element to measure width from (uses parent if available) */
	scrollElement: Accessor<HTMLElement | null>
}

export type MinimapWidthController = {
	/** Current minimap width in CSS pixels */
	minimapWidthCss: Accessor<number>
}

/**
 * Calculates minimap width based on editor width.
 */
export const useMinimapWidth = (
	options: UseMinimapWidthOptions
): MinimapWidthController => {
	const { scrollElement } = options

	const [minimapWidthCss, setMinimapWidthCss] = createSignal(
		MINIMAP_MIN_WIDTH_CSS
	)

	const widthMeasureTarget = () => {
		const scrollHost = scrollElement()
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

	return { minimapWidthCss }
}
