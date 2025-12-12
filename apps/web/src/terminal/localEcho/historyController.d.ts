/**
 * Ring buffer controller for command history navigation.
 * Provides previous/next navigation through stored entries.
 */
export declare class HistoryController {
	private readonly maxSize
	private entries
	private cursor
	constructor(size?: number)
	/**
	 * Push a new entry to history.
	 * Skips empty entries and consecutive duplicates.
	 * Maintains ring buffer size by removing oldest entries.
	 */
	push(entry: string): void
	/**
	 * Rewind cursor to the end (after latest entry).
	 * Call this when input is cancelled or reset.
	 */
	rewind(): void
	/**
	 * Get the previous history entry.
	 * Returns undefined if at the beginning.
	 */
	getPrevious(): string | undefined
	/**
	 * Get the next history entry.
	 * Returns undefined if past the end (current input).
	 */
	getNext(): string | undefined
	/** Get current entry count */
	get length(): number
	/** Get all entries (for debugging/testing) */
	getEntries(): readonly string[]
}
//# sourceMappingURL=historyController.d.ts.map
