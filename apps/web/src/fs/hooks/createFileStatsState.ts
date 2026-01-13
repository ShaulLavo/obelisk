/* eslint-disable solid/reactivity */
import { createStore } from 'solid-js/store'
import type { ParseResult } from '@repo/utils'
import { createFilePath } from '@repo/fs'

export const createFileStatsState = () => {
	const [fileStats, setFileStatsStore] = createStore<
		Record<string, ParseResult | undefined>
	>({})

	const evictFileStatsEntry = (path: string) => {
		setFileStatsStore(createFilePath(path), undefined)
	}

	const setFileStats = (path: string, result?: ParseResult) => {
		if (!path) return
		setFileStatsStore(createFilePath(path), result)
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
