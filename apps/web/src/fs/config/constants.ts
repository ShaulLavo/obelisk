import type { FsSource } from '../types'

export const OPFS_ROOT_NAME = 'root' as const

/**
 * Returns the default FsSource. Evaluated at call time so that
 * env overrides (e.g. vitest) applied after module load are respected.
 */
export function getDefaultSource(): FsSource {
	const isTest =
		import.meta.env?.VITEST ||
		import.meta.env?.MODE === 'test' ||
		(globalThis as unknown as Record<string, unknown>).vTest
	if (isTest) return 'memory'

	// Dev-only escape hatch: `?fs=memory` (or `opfs`) runs the app without the
	// directory picker, which otherwise has to be satisfied by hand before
	// anything can be loaded or debugged.
	if (import.meta.env?.DEV && typeof location !== 'undefined') {
		const requested = new URLSearchParams(location.search).get('fs')
		if (requested === 'memory' || requested === 'opfs' || requested === 'local') {
			return requested
		}
	}

	return 'local'
}

export const DEFERRED_SEGMENTS = new Set([
	'node_modules',
	'.git',
	'.hg',
	'.svn',
	'.vite',
	'dist',
	'build',
	'.cache',
	'target',
])
