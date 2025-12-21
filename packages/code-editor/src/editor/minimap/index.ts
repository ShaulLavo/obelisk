// Components
export { Minimap } from './Minimap'
export { MinimapView } from './MinimapView'
export { MinimapCanvas, type MinimapCanvasProps } from './MinimapCanvas'
export { MinimapOverlay, type MinimapOverlayProps } from './MinimapOverlay'

// Types
export type { MinimapProps } from './types'

// Core Hook (composes smaller hooks)
export {
	useMinimapCore,
	type MinimapCoreController,
	type UseMinimapCoreOptions,
} from './useMinimapCore'

// Focused Hooks
export {
	useMinimapWidth,
	type MinimapWidthController,
	type UseMinimapWidthOptions,
} from './useMinimapWidth'
export {
	useMinimapResize,
	type MinimapResizeController,
	type UseMinimapResizeOptions,
} from './useMinimapResize'
export {
	useMinimapRender,
	type UseMinimapRenderOptions,
} from './useMinimapRender'
export {
	useMinimapScroll,
	type UseMinimapScrollOptions,
} from './useMinimapScroll'
export {
	useMinimapOverlay,
	type MinimapOverlayController,
	type UseMinimapOverlayOptions,
} from './useMinimapOverlay'
export {
	useMinimapInteraction,
	type DragState,
	type MinimapInteractionHandlers,
	type MinimapInteractionOptions,
} from './useMinimapInteraction'
export {
	useMinimapWorker,
	type MinimapWorkerController,
} from './useMinimapWorker'

// Utils
export {
	getCanvasSizeCss,
	syncCanvasDpr,
	getMinimapLayout,
	computeMinimapWidthCss,
	lineToMinimapY,
} from './minimapUtils'

// Sampling
export {
	createMinimapSamplingState,
	MinimapSamplingState,
	MinimapDirtyTracker,
	coalesceDirtyRanges,
	calculateMinimapViewport,
	type DirtyLineRange,
	type MinimapViewport,
} from './sampling'

// Token Summary
export {
	MINIMAP_SCOPE_TO_COLOR_ID,
	MINIMAP_DEFAULT_PALETTE,
	computeLineDensityPacked,
	getScopeColorId,
	createEmptyTokenSummary,
	createSharedTokenSummary,
	createCompactTokenSummary,
	getTransferables,
	cloneTokenSummary,
	serializeTokenSummary,
	deserializeTokenSummary,
	isSharedArrayBufferAvailable,
	type MinimapTokenSummary,
	type MinimapSummaryRequest,
	type MinimapSummaryResponse,
	type MinimapSummaryUpdate,
} from './tokenSummary'

// Worker Types
export type {
	MinimapLayout,
	MinimapLineData,
	MinimapMode,
	MinimapSize,
	MinimapWorkerMessage,
	MinimapWorkerResponse,
} from './workerTypes'
