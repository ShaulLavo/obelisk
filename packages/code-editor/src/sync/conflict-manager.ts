import type { ConflictResolution, ConflictResolutionStrategy } from './types'

/**
 * Utility functions for conflict resolution.
 * The ConflictManager class has been inlined into EditorFileSyncManager.
 */

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
