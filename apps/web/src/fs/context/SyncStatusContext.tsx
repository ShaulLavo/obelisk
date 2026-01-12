import { createContext, useContext, type ParentProps } from 'solid-js'
import type { SyncStatusInfo } from '@repo/code-editor/sync'

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
	getSyncStatus: (path: string) => SyncStatusInfo
	getTrackedPaths: () => string[]
}

const SyncStatusContext = createContext<SyncStatusContextType>()

/**
 * Provider for sync status.
 * Currently provides stub implementation until EditorFileSyncManager is wired up.
 */
export function SyncStatusProvider(props: ParentProps) {
	const value: SyncStatusContextType = {
		getSyncStatus: () => NOT_WATCHED_STATUS,
		getTrackedPaths: () => [],
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
