import { expose } from "comlink";
import { Parser, Language, Query } from "web-tree-sitter";
import { logger } from "../logger";
import jsHighlightsQuerySource from "../treeSitter/queries/javascript-highlights.scm?raw";
import jsJsxHighlightsQuerySource from "tree-sitter-javascript/queries/highlights-jsx.scm?raw";
import tsHighlightsQuerySource from "../treeSitter/queries/typescript-highlights.scm?raw";
import jsFoldsQuerySource from "../treeSitter/queries/javascript-folds.scm?raw";
import tsFoldsQuerySource from "../treeSitter/queries/typescript-folds.scm?raw";
const log = logger.withTag("treeSitter");
let parserInstance = null;
let parserInitPromise = null;
let languageInstance = null;
let highlightQueries = [];
let foldQueries = [];
const textDecoder = new TextDecoder();
const astCache = new Map();
const locateWasm = () => "/tree-sitter/tree-sitter.wasm";
const tsxGrammarPath = "/tree-sitter/tree-sitter-tsx.wasm";
const ensureParser = async () => {
    if (!parserInitPromise) {
        parserInitPromise = (async () => {
            await Parser.init({ locateFile: locateWasm });
            const parser = new Parser();
            const tsLanguage = await Language.load(tsxGrammarPath);
            parser.setLanguage(tsLanguage);
            parserInstance = parser;
            languageInstance = tsLanguage;
            highlightQueries = [];
            foldQueries = [];
        })().catch((error) => {
            parserInitPromise = null;
            log.error("Tree-sitter parser init failed", error);
            throw error;
        });
    }
    await parserInitPromise;
    return parserInstance;
};
const applyTextEdit = (text, startIndex, oldEndIndex, insertedText) => text.slice(0, startIndex) + insertedText + text.slice(oldEndIndex);
const setCachedEntry = (path, entry) => {
    const existing = astCache.get(path);
    if (existing && existing.tree !== entry.tree) {
        existing.tree.delete();
    }
    astCache.set(path, entry);
};
const highlightQuerySources = [
    tsHighlightsQuerySource,
    jsHighlightsQuerySource,
    jsJsxHighlightsQuerySource,
].filter(Boolean);
const foldQuerySources = [tsFoldsQuerySource, jsFoldsQuerySource].filter(Boolean);
const ensureHighlightQueries = async () => {
    if (highlightQueries.length > 0)
        return highlightQueries;
    const parser = await ensureParser();
    if (!parser)
        return [];
    const language = languageInstance ?? parser.language;
    if (!language)
        return [];
    try {
        const source = highlightQuerySources.join("\n");
        highlightQueries = [new Query(language, source)];
    }
    catch (error) {
        log.error("[Tree-sitter worker] failed to init query", error);
        highlightQueries = [];
    }
    return highlightQueries;
};
const ensureFoldQueries = async () => {
    if (foldQueries.length > 0)
        return foldQueries;
    const parser = await ensureParser();
    if (!parser)
        return [];
    const language = languageInstance ?? parser.language;
    if (!language)
        return [];
    try {
        const source = foldQuerySources.join("\n");
        foldQueries = [new Query(language, source)];
    }
    catch (error) {
        log.error("[Tree-sitter worker] failed to init fold query", error);
        foldQueries = [];
    }
    return foldQueries;
};
// Bracket types we care about
const BRACKET_PAIRS = {
    "(": ")",
    "[": "]",
    "{": "}",
};
const OPEN_BRACKETS = new Set(Object.keys(BRACKET_PAIRS));
const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS));
const runHighlightQueries = async (tree) => {
    if (!tree)
        return undefined;
    const queries = await ensureHighlightQueries();
    if (!queries.length)
        return undefined;
    const results = [];
    const seen = new Set();
    for (const query of queries) {
        for (const match of query.matches(tree.rootNode)) {
            for (const capture of match.captures) {
                const captureName = capture.name ?? "";
                const startIndex = capture.node.startIndex;
                const endIndex = capture.node.endIndex;
                const key = `${startIndex}:${endIndex}:${captureName}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                results.push({
                    startIndex,
                    endIndex,
                    captureName,
                });
            }
        }
    }
    results.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
    return results;
};
const runFoldQueries = async (tree) => {
    if (!tree)
        return undefined;
    const queries = await ensureFoldQueries();
    if (!queries.length)
        return undefined;
    const results = [];
    const seen = new Set();
    for (const query of queries) {
        for (const match of query.matches(tree.rootNode)) {
            for (const capture of match.captures) {
                const node = capture.node;
                const startLine = node.startPosition.row;
                const endLine = node.endPosition.row;
                if (endLine <= startLine)
                    continue;
                const key = `${startLine}:${endLine}:${node.type}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                results.push({
                    startLine,
                    endLine,
                    type: node.type,
                });
            }
        }
    }
    results.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
    return results;
};
const walkTree = (node, visitors, bracketStack) => {
    if (!node)
        return;
    const type = node.type;
    if (OPEN_BRACKETS.has(type)) {
        bracketStack.push({ char: type, index: node.startIndex });
        visitors.onBracket?.({
            index: node.startIndex,
            char: type,
            depth: bracketStack.length,
        });
    }
    else if (CLOSE_BRACKETS.has(type)) {
        const depth = bracketStack.length > 0 ? bracketStack.length : 1;
        visitors.onBracket?.({
            index: node.startIndex,
            char: type,
            depth,
        });
        const last = bracketStack[bracketStack.length - 1];
        if (last && BRACKET_PAIRS[last.char] === type) {
            bracketStack.pop();
        }
    }
    if (node.type === "ERROR" || node.isMissing) {
        visitors.onError?.({
            startIndex: node.startIndex,
            endIndex: node.endIndex,
            isMissing: node.isMissing,
            message: node.type,
        });
    }
    else if (node.hasError) {
        for (let i = 0; i < node.childCount; i++) {
            walkTree(node.child(i), visitors, bracketStack);
        }
        return;
    }
    for (let i = 0; i < node.childCount; i++) {
        walkTree(node.child(i), visitors, bracketStack);
    }
};
const collectTreeData = (tree) => {
    const brackets = [];
    const errors = [];
    const bracketStack = [];
    walkTree(tree.rootNode, {
        onBracket: (info) => brackets.push(info),
        onError: (info) => errors.push(info),
    }, bracketStack);
    return { brackets, errors };
};
const processTree = async (tree) => {
    const { brackets, errors } = collectTreeData(tree);
    const [captures, folds] = await Promise.all([
        runHighlightQueries(tree),
        runFoldQueries(tree),
    ]);
    return {
        captures: captures ?? [],
        folds: folds ?? [],
        brackets,
        errors,
    };
};
const parseAndCacheText = async (path, text) => {
    const parser = await ensureParser();
    if (!parser)
        return undefined;
    const tree = parser.parse(text);
    if (!tree)
        return undefined;
    setCachedEntry(path, { tree, text });
    return processTree(tree);
};
const reparseWithEdit = async (path, payload) => {
    const parser = await ensureParser();
    if (!parser)
        return undefined;
    const cached = astCache.get(path);
    if (!cached)
        return undefined;
    const updatedText = applyTextEdit(cached.text, payload.startIndex, payload.oldEndIndex, payload.insertedText);
    cached.tree.edit({
        startIndex: payload.startIndex,
        oldEndIndex: payload.oldEndIndex,
        newEndIndex: payload.newEndIndex,
        startPosition: payload.startPosition,
        oldEndPosition: payload.oldEndPosition,
        newEndPosition: payload.newEndPosition,
    });
    const nextTree = parser.parse(updatedText, cached.tree);
    if (!nextTree)
        return undefined;
    setCachedEntry(path, { tree: nextTree, text: updatedText });
    return processTree(nextTree);
};
const api = {
    async init() {
        await ensureParser();
    },
    async parse(source) {
        const parser = await ensureParser();
        const tree = parser?.parse(source);
        if (!tree)
            return undefined;
        const result = await processTree(tree);
        tree.delete();
        return result;
    },
    async parseBuffer(payload) {
        const text = textDecoder.decode(new Uint8Array(payload.buffer));
        return parseAndCacheText(payload.path, text);
    },
    async applyEdit(payload) {
        return reparseWithEdit(payload.path, payload);
    },
    async dispose() {
        parserInstance?.delete();
        parserInstance = null;
        parserInitPromise = null;
        for (const query of highlightQueries) {
            query.delete();
        }
        highlightQueries = [];
        for (const query of foldQueries) {
            query.delete();
        }
        foldQueries = [];
        for (const entry of astCache.values()) {
            entry.tree.delete();
        }
        astCache.clear();
    },
};
expose(api);
