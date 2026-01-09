/**
 * Shared terminal buffer that persists across backend switches.
 * Records all terminal output so it can be replayed when switching between
 * xterm and ghostty backends.
 */
const MAX_ENTRY_SIZE = 64 * 1024

export type BufferEntry = {
	type: 'print' | 'println'
	content: string
	source: 'output' | 'history'
	seq: number
}

export type ReplayOptions = {
	maxSize?: number
	endSequence?: number
}

export type SharedBuffer = {
	entries: BufferEntry[]
	add: (
		type: BufferEntry['type'],
		content: string,
		source?: BufferEntry['source']
	) => void
	clear: () => void
	replay: (printer: {
		print: (s: string) => void
		println: (s: string) => void
	}, options?: ReplayOptions) => void
	/** Async replay that yields between batches to prevent blocking */
	replayAsync: (printer: {
		print: (s: string) => void
		println: (s: string) => void
	}, options?: ReplayOptions) => Promise<void>
	/** Get total character count in buffer */
	getTotalSize: () => number
	/** Get sequence of the most recent entry */
	getLastSequence: () => number
	/** Subscribe to new buffer entries */
	subscribe: (listener: (entry: BufferEntry) => void) => () => void
}

const isHighSurrogate = (code: number): boolean =>
	code >= 0xd800 && code <= 0xdbff

const isLowSurrogate = (code: number): boolean =>
	code >= 0xdc00 && code <= 0xdfff

const getChunkEnd = (value: string, start: number, maxSize: number): number => {
	const fallbackEnd = Math.min(start + maxSize, value.length)
	if (fallbackEnd >= value.length) return fallbackEnd

	const prev = value.charCodeAt(fallbackEnd - 1)
	const next = value.charCodeAt(fallbackEnd)
	const end =
		isHighSurrogate(prev) && isLowSurrogate(next) ? fallbackEnd - 1 : fallbackEnd

	return end <= start ? fallbackEnd : end
}

const splitEntry = (content: string, maxSize: number): string[] => {
	if (content.length <= maxSize) return [content]

	const chunks: string[] = []
	let start = 0

	while (start < content.length) {
		const end = getChunkEnd(content, start, maxSize)
		chunks.push(content.slice(start, end))
		start = end
	}

	return chunks
}

const getReplayRange = (entries: BufferEntry[], options?: ReplayOptions) => {
	const maxSize = options?.maxSize
	const endSequence = options?.endSequence
	let endIndex = entries.length

	if (endSequence !== undefined) {
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i]
			if (entry && entry.seq > endSequence) {
				endIndex = i
				break
			}
		}
	}

	if (!maxSize) {
		return { startIndex: 0, endIndex }
	}

	let size = 0
	let index = endIndex

	while (index > 0) {
		const entry = entries[index - 1]
		if (!entry) break

		const nextSize = size + entry.content.length
		if (nextSize > maxSize) break

		size = nextSize
		index -= 1
	}

	return { startIndex: index, endIndex }
}

/**
 * Creates a shared buffer instance.
 * This buffer is stored in module scope so it persists across controller recreations.
 */
export const createSharedBuffer = (): SharedBuffer => {
	const entries: BufferEntry[] = []
	let totalSize = 0
	let nextSequence = 0
	const listeners = new Set<(entry: BufferEntry) => void>()

	const getTotalSize = () => totalSize
	const getLastSequence = () => nextSequence - 1

	return {
		entries,
		add: (type, content, source = 'output') => {
			const chunks = splitEntry(content, MAX_ENTRY_SIZE)
			const lastIndex = chunks.length - 1
			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i]!
				const entryType: BufferEntry['type'] =
					i === lastIndex ? type : 'print'
				const entry: BufferEntry = {
					type: entryType,
					content: chunk,
					source,
					seq: nextSequence,
				}
				nextSequence += 1
				entries.push(entry)
				totalSize += chunk.length
				for (const listener of listeners) {
					listener(entry)
				}
			}
		},
		clear: () => {
			entries.length = 0
			totalSize = 0
			nextSequence = 0
		},
		replay: (printer, options) => {
			const range = getReplayRange(entries, options)
			for (let i = range.startIndex; i < range.endIndex; i++) {
				const entry = entries[i]
				if (!entry) continue
				if (entry.type === 'println') {
					printer.println(entry.content)
				} else {
					printer.print(entry.content)
				}
			}
		},
		replayAsync: async (printer, options) => {
			// Yield every N entries to prevent blocking
			const YIELD_EVERY = 20
			let entryCount = 0
			const range = getReplayRange(entries, options)

			const yieldControl = () =>
				new Promise<void>((resolve) => setTimeout(resolve, 0))

			for (let i = range.startIndex; i < range.endIndex; i++) {
				const entry = entries[i]
				if (!entry) continue
				if (entry.type === 'println') {
					printer.println(entry.content)
				} else {
					printer.print(entry.content)
				}

				entryCount++
				if (entryCount % YIELD_EVERY === 0) {
					await yieldControl()
				}
			}
		},
		getTotalSize,
		getLastSequence,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

// Module-level singleton buffer that persists across terminal switches
let _sharedBuffer: SharedBuffer | null = null

export const getSharedBuffer = (): SharedBuffer => {
	if (!_sharedBuffer) {
		_sharedBuffer = createSharedBuffer()
	}
	return _sharedBuffer
}

export const resetSharedBuffer = (): void => {
	_sharedBuffer = null
}
