import type { FsSource } from '../types'
export type LocalDirectoryFallbackReason = 'unsupported'
export type LocalDirectoryFallbackResult = {
	handle: FileSystemDirectoryHandle
	nextSource?: FsSource
}
type LocalDirectoryFallbackHandler = (
	reason: LocalDirectoryFallbackReason
) => Promise<LocalDirectoryFallbackResult>
export declare function registerLocalDirectoryFallback(
	fn: LocalDirectoryFallbackHandler
): void
export declare function unregisterLocalDirectoryFallback(
	fn: LocalDirectoryFallbackHandler
): void
export declare function requestLocalDirectoryFallback(
	reason: LocalDirectoryFallbackReason
): Promise<LocalDirectoryFallbackResult>
export {}
//# sourceMappingURL=localDirectoryFallbackCoordinator.d.ts.map
