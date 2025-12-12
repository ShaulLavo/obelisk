import type { DocumentIncrementalEdit } from '@repo/code-editor'
export declare const sendIncrementalTreeEdit: (
	path: string | undefined,
	edit: DocumentIncrementalEdit
) =>
	| Promise<
			| import('../workers/treeSitterWorkerTypes').TreeSitterParseResult
			| undefined
	  >
	| undefined
//# sourceMappingURL=incrementalEdits.d.ts.map
