import { Parser, Language, Query } from 'web-tree-sitter';
import type { LanguageId } from './types';
import { LANGUAGE_CONFIG, locateWasm } from './constants';
let parserInstance: Parser | null = null;
let parserInitPromise: Promise<void> | null = null;
export const languageCache = new Map<string, Language>();
export const queryCache = new Map<
	string,
	{ highlight: Query[]; fold: Query[]; }
>();

const initParser = async () => {
	if (!parserInitPromise) {
		parserInitPromise = (async () => {
			await Parser.init({ locateFile: locateWasm });
			parserInstance = new Parser();
		})().catch((error) => {
			parserInitPromise = null;
			throw error;
		});
	}
	await parserInitPromise;
};

const loadLanguage = async (languageId: LanguageId): Promise<Language | undefined> => {
	const cached = languageCache.get(languageId);
	if (cached) return cached;

	const config = LANGUAGE_CONFIG[languageId];
	if (!config) return undefined;

	try {
		const language = await Language.load(config.wasm);
		languageCache.set(languageId, language);
		return language;
	} catch {
		return undefined;
	}
};

const loadQueries = (languageId: LanguageId, language: Language) => {
	if (queryCache.has(languageId)) return;

	const config = LANGUAGE_CONFIG[languageId];
	if (!config) return;

	const highlightQueries: Query[] = [];
	const foldQueries: Query[] = [];

	try {
		const highlightSource = config.highlightQueries.join('\n');
		const foldSource = config.foldQueries.join('\n');

		if (highlightSource.trim()) {
			highlightQueries.push(new Query(language, highlightSource));
		}
		if (foldSource.trim()) {
			foldQueries.push(new Query(language, foldSource));
		}
	} catch {
		// Failed to load queries
	}

	queryCache.set(languageId, { highlight: highlightQueries, fold: foldQueries });
};

export const ensureParser = async (languageId?: LanguageId) => {
	await initParser();

	if (!languageId || !LANGUAGE_CONFIG[languageId] || !parserInstance) return undefined;

	const language = await loadLanguage(languageId);
	if (!language) return undefined;

	parserInstance.setLanguage(language);
	loadQueries(languageId, language);

	return { parser: parserInstance, languageId };
};

export const getParserInstance = () => parserInstance;

export const disposeParser = () => {
	parserInstance?.delete();
	parserInstance = null;
	parserInitPromise = null;

	languageCache.clear();

	queryCache.forEach((entry) => {
		entry.highlight.forEach((q) => q.delete());
		entry.fold.forEach((q) => q.delete());
	});
	queryCache.clear();
};
