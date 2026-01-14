export type {
	SyncState,
	ContentHandle,
	ContentHandleFactory,
} from './types'

export { ByteContentHandle, ByteContentHandleFactory } from './content-handle'

export { SyncController } from './SyncController'
export type { SyncControllerOptions } from './SyncController'

export type {
	ConflictSource,
	ExternalFileChangeEvent,
	FileDeletedEvent,
	FileConflictEvent,
	SyncEvent,
	SyncEventType,
	SyncEventMap,
	SyncEventHandler,
} from './sync-types'

export {
	NativeObserverStrategy,
	PollingObserverStrategy,
	FileSystemObserverManager,
} from './observer-strategy'
export type { ObserverStrategy } from './observer-strategy'
