import type { DeferredDirMetadata } from '../prefetch/treePrefetchWorkerTypes'
export declare const createPrefetchState: () => {
	backgroundPrefetching: import('solid-js').Accessor<boolean>
	setBackgroundPrefetching: import('solid-js').Setter<boolean>
	backgroundIndexedFileCount: import('solid-js').Accessor<number>
	setBackgroundIndexedFileCount: import('solid-js').Setter<number>
	lastPrefetchedPath: import('solid-js').Accessor<string | undefined>
	setLastPrefetchedPath: import('solid-js').Setter<string | undefined>
	prefetchError: import('solid-js').Accessor<string | undefined>
	setPrefetchError: import('solid-js').Setter<string | undefined>
	prefetchProcessedCount: import('solid-js').Accessor<number>
	setPrefetchProcessedCount: import('solid-js').Setter<number>
	prefetchLastDurationMs: import('solid-js').Accessor<number>
	setPrefetchLastDurationMs: import('solid-js').Setter<number>
	prefetchAverageDurationMs: import('solid-js').Accessor<number>
	setPrefetchAverageDurationMs: import('solid-js').Setter<number>
	deferredMetadata: Record<string, DeferredDirMetadata>
	registerDeferredMetadata: (node: DeferredDirMetadata) => void
	clearDeferredMetadata: () => void
}
//# sourceMappingURL=createPrefetchState.d.ts.map
