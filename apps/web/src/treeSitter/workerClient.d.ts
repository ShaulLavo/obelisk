import { type Remote } from 'comlink'
import type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
} from '../workers/treeSitterWorkerTypes'
type TreeSitterWorkerHandle = {
	worker: Worker
	proxy: Remote<TreeSitterWorkerApi>
}
export declare const ensureTreeSitterWorkerReady: () => Promise<TreeSitterWorkerHandle | null>
export declare const disposeTreeSitterWorker: () => Promise<void>
export declare const parseSourceWithTreeSitter: (
	source: string
) => Promise<
	import('../workers/treeSitterWorkerTypes').TreeSitterParseResult | undefined
>
export declare const parseBufferWithTreeSitter: (
	path: string,
	buffer: ArrayBuffer
) => Promise<
	import('../workers/treeSitterWorkerTypes').TreeSitterParseResult | undefined
>
export declare const applyTreeSitterEdit: (
	payload: TreeSitterEditPayload
) => Promise<
	import('../workers/treeSitterWorkerTypes').TreeSitterParseResult | undefined
>
export {}
//# sourceMappingURL=workerClient.d.ts.map
