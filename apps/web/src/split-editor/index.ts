/**
 * Split Editor Module
 *
 * Recursive split editor system with Layout Manager and UI components.
 */

export * from './types'
export { createLayoutManager, type LayoutManager, type LayoutManagerOptions } from './createLayoutManager'
export {
	createPersistedLayoutManager,
	type PersistedLayoutManager,
} from './createPersistedLayoutManager'

// UI Components
export {
	SplitEditor,
	useLayoutManager,
	SplitNode,
	SplitContainer,
	EditorPaneSlot,
	PanePortals,
} from './components'
export type {
	SplitEditorProps,
	SplitNodeProps,
	SplitContainerProps,
	EditorPaneSlotProps,
	PanePortalsProps,
} from './components'
