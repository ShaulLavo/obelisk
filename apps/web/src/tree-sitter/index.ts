/**
 * tree-sitter/ -- Main-thread tree-sitter client and query definitions.
 *
 * This module provides the public API that application code uses to request
 * tree-sitter parsing. It communicates with the web-worker implementation
 * over Comlink.
 *
 * Directory layout:
 *   workerClient.ts  -- Comlink proxy that forwards parse/edit requests to the worker.
 *   queries/         -- .scm highlight and fold query files bundled via `?raw` imports.
 *
 * The heavy lifting (WASM loading, Tree objects, incremental parsing) lives in
 * `src/workers/tree-sitter/`, which runs inside a dedicated Web Worker.
 * See that directory's index.ts for the worker-side architecture.
 */

export {
	ensureTreeSitterWorkerReady,
	disposeTreeSitterWorker,
	parseSourceWithTreeSitter,
	parseBufferWithTreeSitter,
	applyTreeSitterEdit,
	applyTreeSitterEditBatch,
	getTreeSitterWorker,
} from './workerClient'
