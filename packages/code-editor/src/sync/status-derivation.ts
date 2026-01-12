import type { SyncStatusInfo } from './types'
import { deriveSyncStatusType } from './types'

/**
 * Pure functions for deriving sync status from events.
 * No side effects - just compute the new status.
 * All functions use deriveSyncStatusType as the single source of truth.
 */

/** Helper to create a status object with derived type */
function createStatus(
	hasLocalChanges: boolean,
	hasExternalChanges: boolean,
	errorMessage?: string
): SyncStatusInfo {
	return {
		type: deriveSyncStatusType(hasLocalChanges, hasExternalChanges, errorMessage),
		lastSyncTime: Date.now(),
		hasLocalChanges,
		hasExternalChanges,
		errorMessage,
	}
}

/** Create initial status for a newly tracked file */
export function createInitialStatus(isDirty: boolean, hasExternalChanges: boolean): SyncStatusInfo {
	return createStatus(isDirty, hasExternalChanges)
}

/** Create error status */
export function createErrorStatus(
	errorMessage: string,
	hasLocalChanges = false,
	hasExternalChanges = false
): SyncStatusInfo {
	return createStatus(hasLocalChanges, hasExternalChanges, errorMessage)
}

/** Create synced status */
export function createSyncedStatus(): SyncStatusInfo {
	return createStatus(false, false)
}

/** Create conflict status */
export function createConflictStatus(): SyncStatusInfo {
	return createStatus(true, true)
}

/** Derive status from external change event */
export function deriveStatusFromExternalChange(current: SyncStatusInfo, isDirty: boolean): SyncStatusInfo {
	return createStatus(isDirty, true, current.errorMessage)
}

/** Derive status from dirty state change */
export function deriveStatusFromDirtyChange(current: SyncStatusInfo, isDirty: boolean): SyncStatusInfo {
	return createStatus(isDirty, current.hasExternalChanges, current.errorMessage)
}

/** Derive status from sync completion */
export function deriveStatusFromSynced(current: SyncStatusInfo, isDirty: boolean): SyncStatusInfo {
	return createStatus(isDirty, false, current.errorMessage)
}

/** Derive status for deleted file */
export function deriveStatusFromDeletion(hasUnsavedChanges: boolean): SyncStatusInfo {
	const errorMessage = hasUnsavedChanges
		? 'File was deleted externally but has unsaved changes'
		: 'File was deleted externally'
	return createStatus(hasUnsavedChanges, false, errorMessage)
}

/** Default status for unwatched files */
export const NOT_WATCHED_STATUS: SyncStatusInfo = {
	type: 'not-watched',
	lastSyncTime: 0,
	hasLocalChanges: false,
	hasExternalChanges: false,
}
