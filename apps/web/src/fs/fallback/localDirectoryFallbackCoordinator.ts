import type { FsSource } from '../types'

export type LocalDirectoryFallbackReason = 'unsupported'

export type LocalDirectoryFallbackResult = {
	handle: FileSystemDirectoryHandle
	nextSource?: FsSource
}

type LocalDirectoryFallbackHandler = (
	reason: LocalDirectoryFallbackReason
) => Promise<LocalDirectoryFallbackResult>

let handler: LocalDirectoryFallbackHandler | null = null

export function registerLocalDirectoryFallback(
	fn: LocalDirectoryFallbackHandler
): void {
	handler = fn
}

export function unregisterLocalDirectoryFallback(
	fn: LocalDirectoryFallbackHandler
): void {
	if (handler === fn) {
		handler = null
	}
}

export function requestLocalDirectoryFallback(
	reason: LocalDirectoryFallbackReason
): Promise<LocalDirectoryFallbackResult> {
	if (!handler) {
		return Promise.reject(
			new Error('Local directory fallback handler is not registered.')
		)
	}
	return handler(reason)
}
