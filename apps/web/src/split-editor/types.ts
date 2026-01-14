import type { ViewMode } from '../fs/types/ViewMode'
import type { SelectionRange } from '@repo/code-editor'

export type NodeId = string
export type TabId = string
export type SplitDirection = 'horizontal' | 'vertical'

export interface Position {
	line: number
	column: number
}

export interface ViewSettings {
	showLineNumbers: boolean
	showMinimap: boolean
	wordWrap: boolean
	fontSize: number
}

export interface DiffData {
	originalPath: string
	modifiedPath: string
	originalContent?: string
	modifiedContent?: string
}

export interface TabContent {
	type: 'file' | 'diff' | 'empty' | 'custom'
	filePath?: string
	diffData?: DiffData
	customComponent?: string
}

export interface TabState {
	scrollTop: number
	scrollLeft: number
	scrollLineIndex: number
	scrollLineHeight: number
	selections: SelectionRange[]
	cursorPosition: Position
}

export interface Tab {
	id: TabId
	content: TabContent
	state: TabState
	isDirty: boolean
	viewMode: ViewMode
}

interface BaseNode {
	id: NodeId
	parentId: NodeId | null
}

export interface SplitContainer extends BaseNode {
	type: 'container'
	direction: SplitDirection
	sizes: [number, number]
	children: [NodeId, NodeId]
}

export interface EditorPane extends BaseNode {
	type: 'pane'
	tabs: Tab[]
	activeTabId: TabId | null
	viewSettings: ViewSettings
}

export type SplitNode = SplitContainer | EditorPane
export type ScrollSyncMode = 'line' | 'percentage'

export interface ScrollSyncGroup {
	id: string
	tabIds: TabId[]
	mode: ScrollSyncMode
}

export interface LayoutState {
	rootId: NodeId
	nodes: Record<NodeId, SplitNode>
	focusedPaneId: NodeId | null
	scrollSyncGroups: ScrollSyncGroup[]
}

export interface SerializedTab {
	id: TabId
	content: TabContent
	state: TabState
	isDirty: boolean
	viewMode: ViewMode
}

export interface SerializedNode {
	id: NodeId
	parentId: NodeId | null
	type: 'container' | 'pane'
	direction?: SplitDirection
	sizes?: [number, number]
	children?: [NodeId, NodeId]
	tabs?: SerializedTab[]
	activeTabId?: TabId | null
	viewSettings?: ViewSettings
}

export interface SerializedLayout {
	version: 1
	rootId: NodeId
	nodes: SerializedNode[]
	focusedPaneId: NodeId | null
	scrollSyncGroups: ScrollSyncGroup[]
}

export function isContainer(node: SplitNode): node is SplitContainer {
	return node.type === 'container'
}

export function isPane(node: SplitNode): node is EditorPane {
	return node.type === 'pane'
}

export function createDefaultViewSettings(): ViewSettings {
	return {
		showLineNumbers: true,
		showMinimap: false,
		wordWrap: false,
		fontSize: 14,
	}
}

export function createDefaultTabState(): TabState {
	return {
		scrollTop: 0,
		scrollLeft: 0,
		scrollLineIndex: 0,
		scrollLineHeight: 0,
		selections: [],
		cursorPosition: { line: 0, column: 0 },
	}
}

export function createEmptyContent(): TabContent {
	return { type: 'empty' }
}

export function createFileContent(filePath: string): TabContent {
	return { type: 'file', filePath }
}

export function createDiffContent(diffData: DiffData): TabContent {
	return { type: 'diff', diffData }
}

export function createTab(content: TabContent, viewMode: ViewMode = 'editor'): Tab {
	return {
		id: crypto.randomUUID(),
		content,
		state: createDefaultTabState(),
		isDirty: false,
		viewMode,
	}
}
