import { createSignal } from 'solid-js'
import type { SyncStatusInfo, EditorFileSyncManager } from '@repo/code-editor/sync'

/**
 * Service for managing sync status integration with the UI.
 * Bridges EditorFileSyncManager with UI components via Solid-JS reactivity.
 */
export class SyncStatusService {
	private syncStatuses = new Map<string, SyncStatusInfo>()
	private listeners = new Set<(path: string, status: SyncStatusInfo) => void>()
	private statusSignal: () => number
	private setStatusSignal: (value: number | ((prev: number) => number)) => void
	private connectedManager: EditorFileSyncManager | null = null
	private disconnectFn: (() => void) | null = null

	constructor() {
		const [statusSignal, setStatusSignal] = createSignal(0)
		this.statusSignal = statusSignal
		this.setStatusSignal = setStatusSignal
	}

	/**
	 * Get sync status for a file path
	 */
	getSyncStatus(path: string): SyncStatusInfo | undefined {
		// Access the signal to ensure reactivity
		this.statusSignal()
		return this.syncStatuses.get(path)
	}

	/**
	 * Update sync status for a file path
	 */
	updateSyncStatus(path: string, status: SyncStatusInfo): void {
		this.syncStatuses.set(path, status)
		this.setStatusSignal(prev => prev + 1) // Trigger reactivity

		// Notify listeners
		this.listeners.forEach(listener => {
			try {
				listener(path, status)
			} catch (error) {
				console.error('Error in sync status listener:', error)
			}
		})
	}

	/**
	 * Remove sync status for a file path
	 */
	removeSyncStatus(path: string): void {
		if (this.syncStatuses.delete(path)) {
			this.setStatusSignal(prev => prev + 1) // Trigger reactivity
		}
	}

	/**
	 * Subscribe to sync status changes
	 */
	onSyncStatusChange(callback: (path: string, status: SyncStatusInfo) => void): () => void {
		this.listeners.add(callback)

		// Return unsubscribe function
		return () => {
			this.listeners.delete(callback)
		}
	}

	/**
	 * Get all tracked file paths
	 */
	getTrackedPaths(): string[] {
		return Array.from(this.syncStatuses.keys())
	}

	/**
	 * Clear all sync statuses
	 */
	clearAll(): void {
		this.syncStatuses.clear()
		this.setStatusSignal(prev => prev + 1) // Trigger reactivity
	}

	/**
	 * Connect to EditorFileSyncManager to receive status updates.
	 * Returns a disconnect function.
	 */
	connectToSyncManager(syncManager: EditorFileSyncManager): () => void {
		// Disconnect from previous manager if any
		if (this.disconnectFn) {
			this.disconnectFn()
		}

		this.connectedManager = syncManager

		// Subscribe to status changes from the sync manager
		const unsubscribe = syncManager.onSyncStatusChange((path, status) => {
			this.updateSyncStatus(path, status)
		})

		// Create disconnect function
		this.disconnectFn = () => {
			unsubscribe()
			this.connectedManager = null
			this.disconnectFn = null
		}

		return this.disconnectFn
	}

	/**
	 * Check if connected to a sync manager
	 */
	isConnected(): boolean {
		return this.connectedManager !== null
	}

	/**
	 * Get the connected sync manager (if any)
	 */
	getConnectedManager(): EditorFileSyncManager | null {
		return this.connectedManager
	}
}

// Global instance for the application
export const syncStatusService = new SyncStatusService()
