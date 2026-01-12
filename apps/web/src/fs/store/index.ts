export {
	type FileState,
	type FileStateUpdate,
	type FileStateSubscriber,
	type FileStateEvent,
	type FileStateEventHandler,
	type SharedBuffer,
	type ScrollPosition,
	type SyntaxData,
	type TextEdit,
	type FileLoadingState,
	createEmptyFileState,
} from './types'

export {
	FileStateStore,
	createFileStateStore,
	type PersistenceBackend,
	type FileStateStoreOptions,
} from './FileStateStore'

export { createIndexedDBBackend } from './IndexedDBBackend'
