/**
 * Split Editor Components
 *
 * UI components for the recursive split editor system.
 */

export {
	SplitEditor,
	useLayoutManager,
	useResourceManager,
} from './SplitEditor'
export type { SplitEditorProps } from './SplitEditor'

export { SplitNode } from './SplitNode'
export type { SplitNodeProps } from './SplitNode'

export { SplitContainer } from './SplitContainer'
export type { SplitContainerProps } from './SplitContainer'

export { EditorPaneSlot } from './EditorPaneSlot'
export type { EditorPaneSlotProps } from './EditorPaneSlot'

export { TabBar } from './TabBar'
export type { TabBarProps } from './TabBar'

export { TabItem } from './TabItem'
export type { TabItemProps } from './TabItem'

export { PanePortals } from './PanePortals'
export type { PanePortalsProps } from './PanePortals'

export { TabContent, getContentTypeLabel } from './TabContent'
export type { TabContentProps } from './TabContent'

export { FileTab } from './FileTab'
export type { FileTabProps } from './FileTab'
