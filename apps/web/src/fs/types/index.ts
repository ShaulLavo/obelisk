export type { ViewMode } from './ViewMode'

export type { ViewModeDefinition } from '../registry/ViewModeRegistry'
export {
	ViewModeRegistry,
	viewModeRegistry,
	getViewModeRegistry,
} from '../registry/ViewModeRegistry'

export {
	detectAvailableViewModes,
	getDefaultViewMode,
	supportsMultipleViewModes,
	isViewModeValid,
	getViewModeLabel,
	getValidViewMode,
	isRegularFile,
} from '../utils/viewModeDetection'
