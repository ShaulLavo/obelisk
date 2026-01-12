import { createMemo, type Accessor } from 'solid-js'
import { useSyncStatusContext } from '../context/SyncStatusContext'
import type { SyncStatusType } from '../types'

/**
 * Hook to aggregate sync status across multiple files.
 * Returns counts by status type and overall status for the set.
 */
export function createAggregatedSyncStatus(filePaths: Accessor<string[]>) {
	const context = useSyncStatusContext()

	return createMemo(() => {
		const paths = filePaths()
		const statuses = paths.map((path) => context.getStatus(path))

		const counts = {
			synced: 0,
			dirty: 0,
			externalChanges: 0,
			conflicts: 0,
			errors: 0,
			notWatched: 0,
			total: statuses.length,
		}

		for (const status of statuses) {
			switch (status.type) {
				case 'synced':
					counts.synced++
					break
				case 'dirty':
					counts.dirty++
					break
				case 'external-changes':
					counts.externalChanges++
					break
				case 'conflict':
					counts.conflicts++
					break
				case 'error':
					counts.errors++
					break
				case 'not-watched':
					counts.notWatched++
					break
			}
		}

		// Determine overall status (priority: error > conflict > external > dirty > synced)
		let overallStatus: SyncStatusType = 'synced'
		if (counts.errors > 0) {
			overallStatus = 'error'
		} else if (counts.conflicts > 0) {
			overallStatus = 'conflict'
		} else if (counts.externalChanges > 0) {
			overallStatus = 'external-changes'
		} else if (counts.dirty > 0) {
			overallStatus = 'dirty'
		} else if (counts.notWatched === counts.total) {
			overallStatus = 'not-watched'
		}

		return {
			counts,
			overallStatus,
			hasIssues: counts.conflicts > 0 || counts.errors > 0,
			needsAttention: counts.conflicts > 0 || counts.errors > 0 || counts.externalChanges > 0,
		}
	})
}
