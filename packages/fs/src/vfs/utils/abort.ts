export function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) {
		const reason = (signal as AbortSignal & { reason?: unknown }).reason
		if (reason instanceof Error) {
			throw reason
		}
		throw new DOMException('Aborted', 'AbortError')
	}
}
