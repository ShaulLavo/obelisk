import type { ConflictEvent } from '@repo/fs'
import type {
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
	PendingConflict,
} from './types'

/**
 * Manages pending conflicts and their resolution state.
 * Extracted from EditorFileSyncManager for single responsibility.
 */
export class ConflictManager {
	private readonly pendingConflicts = new Map<string, PendingConflict>()

	/** Get conflict info for a file */
	getConflictInfo(path: string): ConflictInfo | undefined {
		return this.pendingConflicts.get(path)?.conflictInfo
	}

	/** Get all pending conflicts */
	getPendingConflicts(): ConflictInfo[] {
		return Array.from(this.pendingConflicts.values()).map((pc) => pc.conflictInfo)
	}

	/** Check if a file has a pending conflict */
	hasConflict(path: string): boolean {
		return this.pendingConflicts.has(path)
	}

	/** Get the number of pending conflicts */
	getConflictCount(): number {
		return this.pendingConflicts.size
	}

	/** Create a conflict from a sync event */
	createConflict(path: string, event: ConflictEvent): ConflictInfo {
		const conflictInfo: ConflictInfo = {
			path,
			baseContent: event.baseContent.toString(),
			localContent: event.localContent.toString(),
			externalContent: event.diskContent.toString(),
			lastModified: Date.now(),
			conflictTimestamp: Date.now(),
		}

		this.pendingConflicts.set(path, {
			path,
			conflictInfo,
			timestamp: Date.now(),
		})

		return conflictInfo
	}

	/** Add a conflict directly (used for undo) */
	addConflict(conflictInfo: ConflictInfo): void {
		this.pendingConflicts.set(conflictInfo.path, {
			path: conflictInfo.path,
			conflictInfo,
			timestamp: Date.now(),
		})
	}

	/** Remove a conflict (after resolution or skip) */
	removeConflict(path: string): boolean {
		return this.pendingConflicts.delete(path)
	}

	/** Clear all conflicts */
	clear(): void {
		this.pendingConflicts.clear()
	}
}

/** Display names for resolution strategies */
const STRATEGY_DISPLAY_NAMES: Record<ConflictResolutionStrategy, string> = {
	'keep-local': 'Keep Local Changes',
	'use-external': 'Use External Changes',
	'manual-merge': 'Manual Merge',
	skip: 'Skip',
}

/** Get display name for a resolution strategy */
export function getStrategyDisplayName(strategy: ConflictResolutionStrategy): string {
	return STRATEGY_DISPLAY_NAMES[strategy] ?? 'Unknown Strategy'
}

/** Check if a resolution strategy can be auto-resolved */
export function canAutoResolve(strategy: ConflictResolutionStrategy): boolean {
	return strategy !== 'manual-merge' && strategy !== 'skip'
}

/** Create a resolution from a strategy */
export function createResolution(strategy: ConflictResolutionStrategy, mergedContent?: string): ConflictResolution {
	if (strategy === 'manual-merge' && !mergedContent) {
		throw new Error('Manual merge strategy requires merged content')
	}
	return { strategy, mergedContent }
}
