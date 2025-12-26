/**
 * MinimapView component.
 * Main minimap view that composes all hooks and child components.
 * Must be rendered inside ScrollStateProvider.
 */

import { AutoHideVisibility, AutoHideWrapper } from '@repo/ui/auto-hide-wrapper'
import { clsx } from 'clsx'
import { createSignal } from 'solid-js'
import { useCursor } from '../cursor'
import { MinimapCanvas } from './MinimapCanvas'
import { MinimapOverlay } from './MinimapOverlay'
import { Scrollbar } from './Scrollbar'
import type { MinimapProps } from './types'
import { useMinimapCore } from './useMinimapCore'
import { useMinimapInteraction } from './useMinimapInteraction'
import { useMinimapOverlay } from './useMinimapOverlay'

const MINIMAP_VISIBILITY = AutoHideVisibility.AUTO

/**
 * Main minimap view component.
 * Requires ScrollStateProvider context.
 */
export const MinimapView = (props: MinimapProps) => {
	const cursor = useCursor()
	const [isDragging, setIsDragging] = createSignal(false)

	// Core hook for worker, resize, and scroll sync
	const core = useMinimapCore(props, () => overlay.scheduleRender())

	// Overlay hook for cursor/selection/error rendering
	const overlay = useMinimapOverlay({
		container: core.container,
		scrollElement: () => props.scrollElement(),
		errors: () => props.errors?.(),
		visible: core.overlayVisible,
		isDark: core.isDark,
	})

	// Interaction hook for pointer events
	const interaction = useMinimapInteraction({
		scrollElement: () => props.scrollElement() ?? undefined,
		getCanvasSizeCss: () => {
			const cont = core.container()
			if (!cont) return null
			const rect = cont.getBoundingClientRect()
			return {
				width: Math.max(1, Math.round(rect.width)),
				height: Math.max(1, Math.round(rect.height)),
			}
		},
		getLineCount: () => cursor.lines.lineCount(),
	})

	// Pointer event handlers with drag state sync
	const handlePointerDown = (e: PointerEvent) => {
		e.preventDefault()
		interaction.handlePointerDown(e)
		if (interaction.isDragging()) {
			setIsDragging(true)
		}
	}

	const handlePointerUp = (e: PointerEvent) => {
		interaction.handlePointerUp(e)
		setIsDragging(false)
	}

	const computedVisibility = () =>
		isDragging() ? AutoHideVisibility.SHOW : MINIMAP_VISIBILITY

	return (
		<>
			<AutoHideWrapper
				visibility={computedVisibility()}
				class={clsx(
					"absolute right-[14px] top-0 h-full z-50 group/minimap before:absolute before:-left-2 before:top-0 before:h-full before:w-[8px] before:content-[''] border-l border-white/5",
					computedVisibility() === AutoHideVisibility.SHOW
						? 'opacity-100'
						: 'opacity-0 hover:opacity-100'
				)}
				style={{
					'view-transition-name': 'minimap',
					width: `${core.minimapWidthCss()}px`,
					'background-color': core.backgroundColor(),
				}}
				ref={core.setContainer}
				onPointerDown={handlePointerDown}
				onPointerMove={interaction.handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onLostPointerCapture={handlePointerUp}
				onWheel={interaction.handleWheel}
			>
				<MinimapCanvas setCanvas={core.setBaseCanvas} />
				<MinimapOverlay setCanvas={overlay.setCanvas} />
			</AutoHideWrapper>
			<Scrollbar class="absolute right-0 top-0 h-full z-50" />
		</>
	)
}
