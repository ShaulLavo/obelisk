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
	return isTest ? 'memory' : 'local'
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
