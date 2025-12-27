import { Parser, Language, Query } from 'web-tree-sitter'
import type { LanguageId } from './types'
import { LANGUAGE_CONFIG, locateWasm } from './constants'
import { logger } from '../../logger'

const log = logger.withTag('treeSitter')

let parserInstance: Parser | null = null
let parserInitPromise: Promise<void> | null = null
export const languageCache = new Map<string, Language>()
export const queryCache = new Map<
	string,
	{ highlight: Query[]; fold: Query[] }
>()

const fetchQuery = async (url: string): Promise<string> => {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Failed to fetch query: ${url}`)
	return res.text()
}

export const ensureParser = async (languageId?: LanguageId) => {
	if (!parserInitPromise) {
		parserInitPromise = (async () => {
			await Parser.init({ locateFile: locateWasm })
			parserInstance = new Parser()
		})().catch((error) => {
			parserInitPromise = null
			log.error('Tree-sitter parser init failed', error)
			throw error
		})
	}
	await parserInitPromise

	if (!languageId || !LANGUAGE_CONFIG[languageId]) return undefined
	const config = LANGUAGE_CONFIG[languageId]

	if (!parserInstance) return undefined

	// Load Language if not cached
	let language = languageCache.get(languageId)
	if (!language) {
		try {
			language = await Language.load(config.wasm)
			languageCache.set(languageId, language)
		} catch (e) {
			log.error(`Failed to load language ${languageId}`, e)
			return undefined
		}
	}

	parserInstance.setLanguage(language)

	// Load Queries if not cached
	if (!queryCache.has(languageId)) {
		const highlightQueries: Query[] = []
		const foldQueries: Query[] = []

		try {
			// Combine sources
			let combinedHighlightSource = ''
			for (const source of config.highlightQueries) {
				if (source.startsWith('/')) {
					combinedHighlightSource += (await fetchQuery(source)) + '\n'
				} else {
					combinedHighlightSource += source + '\n'
				}
			}

			let combinedFoldSource = ''
			for (const source of config.foldQueries) {
				if (source.startsWith('/')) {
					combinedFoldSource += (await fetchQuery(source)) + '\n'
				} else {
					combinedFoldSource += source + '\n'
				}
			}

			if (combinedHighlightSource.trim()) {
				highlightQueries.push(new Query(language, combinedHighlightSource))
			}
			if (combinedFoldSource.trim()) {
				foldQueries.push(new Query(language, combinedFoldSource))
			}
		} catch (e) {
			log.error(`Failed to load queries for ${languageId}`, e)
		}

		queryCache.set(languageId, {
			highlight: highlightQueries,
			fold: foldQueries,
		})
	}

	return { parser: parserInstance, languageId }
}

export const getParserInstance = () => parserInstance

export const disposeParser = () => {
	parserInstance?.delete()
	parserInstance = null
	parserInitPromise = null

	languageCache.clear()

	queryCache.forEach((entry) => {
		entry.highlight.forEach((q) => q.delete())
		entry.fold.forEach((q) => q.delete())
	})
	queryCache.clear()
}
