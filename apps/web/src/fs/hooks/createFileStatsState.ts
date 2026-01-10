/* eslint-disable solid/reactivity */
import { createStore } from 'solid-js/store'
import type { ParseResult } from '@repo/utils'

/**
 * Normalize path by stripping leading slash.
 * Cache keys use normalized paths (without leading slash).
 */
const normalizePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path

export const createFileStatsState = () => {
	const [fileStats, setFileStatsStore] = createStore<
		Record<string, ParseResult | undefined>
	>({})

	const evictFileStatsEntry = (path: string) => {
		setFileStatsStore(normalizePath(path), undefined)
	}

	const setFileStats = (path: string, result?: ParseResult) => {
		if (!path) return
		setFileStatsStore(normalizePath(path), result)
	}

	const clearParseResults = () => {
		for (const path of Object.keys(fileStats)) {
			evictFileStatsEntry(path)
		}
	}

	return {
		fileStats,
		setFileStats,
		clearParseResults,
	}
}
