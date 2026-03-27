/**
 * Ring buffer controller for command history navigation.
 * Provides previous/next navigation through stored entries.
 */
export class HistoryController {
	private readonly maxSize: number
	private entries: string[] = []
	private cursor = 0

	constructor(size = 10) {
		this.maxSize = size
	}

	/**
	 * Push a new entry to history.
	 * Skips empty entries and consecutive duplicates.
	 * Maintains ring buffer size by removing oldest entries.
	 */
	push(entry: string): void {
		const trimmed = entry.trim()
		if (trimmed === '') return

		const lastEntry = this.entries[this.entries.length - 1]
		if (entry === lastEntry) return

		this.entries.push(entry)

		if (this.entries.length > this.maxSize) {
			this.entries.shift()
		}

		this.cursor = this.entries.length
	}

	/**
	 * Rewind cursor to the end (after latest entry).
	 * Call this when input is cancelled or reset.
	 */
	rewind(): void {
		this.cursor = this.entries.length
	}

	/**
	 * Get the previous history entry.
	 * Returns undefined if at the beginning.
	 */
	getPrevious(): string | undefined {
		const idx = Math.max(0, this.cursor - 1)
		this.cursor = idx
		return this.entries[idx]
	}

	/**
	 * Get the next history entry.
	 * Returns undefined if past the end (current input).
	 */
	getNext(): string | undefined {
		const idx = Math.min(this.entries.length, this.cursor + 1)
		this.cursor = idx
		return this.entries[idx]
	}

	/** Get current entry count */
	get length(): number {
		return this.entries.length
	}

	/** Get all entries (for debugging/testing) */
	getEntries(): readonly string[] {
		return this.entries
	}
}
