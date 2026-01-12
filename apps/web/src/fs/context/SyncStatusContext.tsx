import { createContext, useContext, type ParentProps } from 'solid-js'
import type { SyncStatusInfo } from '@repo/code-editor/sync'
import { syncStatusService } from '../services/SyncStatusService'

type SyncStatusContextType = {
	getSyncStatus: (path: string) => SyncStatusInfo | undefined
	updateSyncStatus: (path: string, status: SyncStatusInfo) => void
	removeSyncStatus: (path: string) => void
	onSyncStatusChange: (callback: (path: string, status: SyncStatusInfo) => void) => () => void
	getTrackedPaths: () => string[]
	clearAll: () => void
}

const SyncStatusContext = createContext<SyncStatusContextType>()

/**
 * Provider for sync status management throughout the application.
 * Uses the singleton SyncStatusService directly.
 */
export function SyncStatusProvider(props: ParentProps) {
	const value: SyncStatusContextType = {
		getSyncStatus: (path) => syncStatusService.getSyncStatus(path),
		updateSyncStatus: (path, status) => syncStatusService.updateSyncStatus(path, status),
		removeSyncStatus: (path) => syncStatusService.removeSyncStatus(path),
		onSyncStatusChange: (callback) => syncStatusService.onSyncStatusChange(callback),
		getTrackedPaths: () => syncStatusService.getTrackedPaths(),
		clearAll: () => syncStatusService.clearAll(),
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
