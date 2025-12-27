import type { FsSource } from '../types'

export const OPFS_ROOT_NAME = 'root' as const
const isTest =
	import.meta.env?.VITEST ||
	import.meta.env?.MODE === 'test' ||
	(globalThis as any).vTest

export const DEFAULT_SOURCE: FsSource = isTest ? 'memory' : 'local'

export const IGNORED_SEGMENTS = new Set([
	'node_modules',
	'.git',
	'.hg',
	'.svn',
	'.vite',
	'dist',
	'build',
	'.cache',
])
