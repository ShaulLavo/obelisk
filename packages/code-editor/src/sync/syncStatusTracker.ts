import type { SyncStatusInfo, SyncStatusType } from './types'

/**
 * All display configuration for sync status types in one place.
 * Add new status types here and everything will update.
 */
const STATUS_CONFIG: Record<SyncStatusType, {
	description: string
	className: string
	bgColor: string
	badgeColor: string
	icon: string
	shortText: string
}> = {
	synced: {
		description: 'File is up to date',
		className: 'sync-status-synced',
		bgColor: 'bg-green-500',
		badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
		icon: '✓',
		shortText: 'Synced',
	},
	dirty: {
		description: 'File has unsaved changes',
		className: 'sync-status-dirty',
		bgColor: 'bg-orange-500',
		badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
		icon: '●',
		shortText: 'Modified',
	},
	'external-changes': {
		description: 'File was modified externally',
		className: 'sync-status-external',
		bgColor: 'bg-blue-500',
		badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
		icon: '↻',
		shortText: 'External Changes',
	},
	conflict: {
		description: 'File has both local and external changes',
		className: 'sync-status-conflict',
		bgColor: 'bg-red-500',
		badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
		icon: '⚠',
		shortText: 'Conflict',
	},
	error: {
		description: 'Sync error occurred',
		className: 'sync-status-error',
		bgColor: 'bg-red-600',
		badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
		icon: '✗',
		shortText: 'Error',
	},
	'not-watched': {
		description: 'File is not being watched for changes',
		className: 'sync-status-not-watched',
		bgColor: 'bg-gray-400',
		badgeColor: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
		icon: '○',
		shortText: 'Not Watched',
	},
}

const DEFAULT_CONFIG = {
	description: 'Unknown status',
	className: 'sync-status-unknown',
	bgColor: 'bg-gray-400',
	badgeColor: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
	icon: '?',
	shortText: 'Unknown',
}

/** Get config for a status type */
function getConfig(type: SyncStatusType) {
	return STATUS_CONFIG[type] ?? DEFAULT_CONFIG
}

/** Get user-friendly description of the status */
export function getStatusDescription(status: SyncStatusInfo): string {
	if (status.type === 'error' && status.errorMessage) {
		return status.errorMessage
	}
	return getConfig(status.type).description
}

/** Get CSS class name for status indicator styling */
export function getStatusClassName(status: SyncStatusInfo): string {
	return getConfig(status.type).className
}

/** Get background color class for the status dot */
export function getStatusBgColor(type: SyncStatusType): string {
	return getConfig(type).bgColor
}

/** Get badge color classes (bg + text) */
export function getStatusBadgeColor(type: SyncStatusType): string {
	return getConfig(type).badgeColor
}

/** Get icon for the status */
export function getStatusIcon(type: SyncStatusType): string {
	return getConfig(type).icon
}

/** Get short text for the status */
export function getStatusShortText(type: SyncStatusType): string {
	return getConfig(type).shortText
}
