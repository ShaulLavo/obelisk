export async function* iterateDirectoryEntries(
	handle: FileSystemDirectoryHandle
): AsyncIterable<[string, FileSystemHandle]> {
	const withEntries = handle as FileSystemDirectoryHandle & {
		entries?: () => AsyncIterable<[string, FileSystemHandle]>
	}

	if (typeof withEntries.entries === 'function') {
		for await (const entry of withEntries.entries()) {
			yield entry
		}
		return
	}

	const iterable = handle as unknown as AsyncIterable<
		[string, FileSystemHandle]
	>
	if (typeof iterable[Symbol.asyncIterator] === 'function') {
		for await (const entry of iterable) {
			yield entry
		}
		return
	}

	throw new Error('Directory handle is not iterable')
}
