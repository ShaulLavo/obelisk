import { createContext, useContext, type ParentProps, createSignal, onCleanup } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { SyncStatusInfo, ConflictInfo } from '@repo/code-editor/sync'
import type { EditorFileSyncManager } from '@repo/code-editor/sync'

/**
 * Default status for files when sync is not active
 */
const NOT_WATCHED_STATUS: SyncStatusInfo = {
	type: 'not-watched',
	lastSyncTime: 0,
	hasLocalChanges: false,
	hasExternalChanges: false,
}

type SyncStatusContextType = {
	/** Get sync status for a file path */
	getSyncStatus: (path: string) => SyncStatusInfo
	/** Get all tracked file paths */
	getTrackedPaths: () => string[]
	/** Get pending conflicts */
	getPendingConflicts: () => ConflictInfo[]
	/** Get conflict count */
	getConflictCount: () => number
	/** Check if a file has a conflict */
	hasConflict: (path: string) => boolean
	/** The sync manager (if available) */
	syncManager: EditorFileSyncManager | null
}

const SyncStatusContext = createContext<SyncStatusContextType>()

export interface SyncStatusProviderProps extends ParentProps {
	/** The EditorFileSyncManager to wire up (optional - uses stub if not provided) */
	syncManager?: EditorFileSyncManager
}

/**
 * Provider for sync status.
 * When syncManager is provided, it subscribes to status changes and provides real sync status.
 * Otherwise provides stub implementation.
 */
export function SyncStatusProvider(props: SyncStatusProviderProps) {
	// Store for reactive status updates
	const [statuses, setStatuses] = createStore<Record<string, SyncStatusInfo>>({})
	const [trackedPaths, setTrackedPaths] = createSignal<string[]>([])
	const [conflicts, setConflicts] = createSignal<ConflictInfo[]>([])

	// Subscribe to sync manager events if provided
	if (props.syncManager) {
		const manager = props.syncManager

		// Subscribe to status changes
		const unsubscribeStatus = manager.onSyncStatusChange((path, status) => {
			setStatuses(produce((draft) => {
				draft[path] = status
			}))
			// Update tracked paths list
			setTrackedPaths(Object.keys(statuses))
		})

		// Subscribe to conflict changes
		const unsubscribeConflict = manager.onConflictResolutionRequest((_path, _info) => {
			setConflicts(manager.getPendingConflicts())
		})

		onCleanup(() => {
			unsubscribeStatus()
			unsubscribeConflict()
		})
	}

	const value: SyncStatusContextType = {
		getSyncStatus: (path: string) => {
			if (props.syncManager) {
				// Try the store first for reactive updates
				const storedStatus = statuses[path]
				if (storedStatus) return storedStatus
				// Fall back to direct manager query
				return props.syncManager.getSyncStatus(path)
			}
			return NOT_WATCHED_STATUS
		},
		getTrackedPaths: () => {
			if (props.syncManager) {
				return trackedPaths()
			}
			return []
		},
		getPendingConflicts: () => {
			if (props.syncManager) {
				return props.syncManager.getPendingConflicts()
			}
			return []
		},
		getConflictCount: () => {
			if (props.syncManager) {
				return props.syncManager.getConflictCount()
			}
			return 0
		},
		hasConflict: (path: string) => {
			if (props.syncManager) {
				return props.syncManager.hasConflict(path)
			}
			return false
		},
		syncManager: props.syncManager ?? null,
	}

	return (
		<SyncStatusContext.Provider value={value}>
			{props.children}
		</SyncStatusContext.Provider>
	)
}

/**
 * Hook to access sync status context
 */
export function useSyncStatusContext() {
	const context = useContext(SyncStatusContext)
	if (!context) {
		throw new Error('useSyncStatusContext must be used within a SyncStatusProvider')
	}
	return context
}
