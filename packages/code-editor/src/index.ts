export * from './editor'
export * from './sync'

// New imperative runtime exports
export { makeEditorSession } from './runtime/makeEditorSession'
export type { EditorSession, EditorSessionConfig, ViewState } from './runtime/makeEditorSession'
export { ImperativeEditor } from './solid/Editor'
export type { ImperativeEditorProps } from './solid/Editor'
export { createSolidEditorHost } from './solid/createSolidEditorHost'
export type { SolidEditorHost, SolidEditorHostConfig } from './solid/createSolidEditorHost'

// Core types (stable public API)
export type {
	EditorCore,
	EditorCoreConfig,
	EditorTransaction,
	EditorSnapshot,
	DocumentIdentity,
	SelectionRange as CoreSelectionRange,
	ViewportState,
	FlushReceipt,
	FrameScheduler,
} from './core/types'
