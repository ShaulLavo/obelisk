/**
 * workers/tree-sitter/ -- Web Worker implementation for tree-sitter parsing.
 *
 * This module runs inside a dedicated Web Worker and owns all WASM-level
 * tree-sitter state: language loading, Tree objects, incremental edits,
 * bracket matching, fold computation, and minimap token summaries.
 *
 * Directory layout:
 *   treeSitter.worker.ts -- Worker entry point exposed via Comlink.
 *   parser.ts            -- WASM initialisation and language loading.
 *   parse.ts             -- Full-file parsing pipeline.
 *   edits.ts             -- Incremental edit application.
 *   queries.ts           -- Highlight and fold query execution.
 *   cache.ts             -- Per-file Tree / capture cache.
 *   treeWalk.ts          -- AST traversal utilities.
 *   minimap.ts           -- Token summary generation for minimap rendering.
 *   constants.ts         -- Language configs, extension maps, bracket pairs.
 *   types.ts             -- Shared type definitions for the worker API.
 *
 * The main-thread client that communicates with this worker lives in
 * `src/tree-sitter/`. See that directory's index.ts for the client-side API.
 */

export type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
	TreeSitterParseResult,
	TreeSitterCapture,
	BracketInfo,
	TreeSitterError,
	LanguageId,
	CachedTreeEntry,
} from './types'
