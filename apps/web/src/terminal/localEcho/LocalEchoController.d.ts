import type { Terminal } from 'ghostty-web'
import type {
	AutocompleteCallback,
	ILocalEchoController,
	LocalEchoOptions,
} from './types'
/**
 * Local terminal controller for displaying messages and handling local echo.
 *
 * Supports bash-like input primitives:
 * - Arrow navigation on input
 * - Alt-arrow for word-boundary navigation
 * - Alt-backspace for word-boundary deletion
 * - Multi-line input for incomplete commands
 * - Tab completion with autocomplete handlers
 * - Command history navigation
 */
export declare class LocalEchoController implements ILocalEchoController {
	private term
	private history
	private maxAutocompleteEntries
	private autocompleteHandlers
	private active
	private input
	private cursor
	private activePrompt
	private activeCharPrompt
	private termSize
	private disposables
	private promptVisible
	private continuationVisible
	constructor(options?: LocalEchoOptions)
	activate(term: Terminal): void
	dispose(): void
	/** Detach the controller from the terminal */
	detach(): void
	/** Attach controller to the terminal */
	attach(): void
	/** Register an autocomplete handler */
	addAutocompleteHandler(fn: AutocompleteCallback, ...args: unknown[]): void
	/** Remove a previously registered autocomplete handler */
	removeAutocompleteHandler(fn: AutocompleteCallback): void
	/**
	 * Read a line of input from the user.
	 * Returns a promise that resolves when Enter is pressed.
	 */
	read(prompt: string, continuationPrompt?: string): Promise<string>
	/**
	 * Read a single character from the user.
	 * Takes priority over any active read() operation.
	 */
	readChar(prompt: string): Promise<string>
	/** Abort any pending read operation */
	abortRead(reason?: string): void
	/** Print a message followed by newline */
	println(message: string): void
	/** Print a message, converting newlines properly */
	print(message: string): void
	/** Print items in wide column format */
	printWide(items: string[], padding?: number): void
	/** Apply prompt prefixes to input for display */
	private applyPrompts
	/** Calculate display offset accounting for prompt length */
	private applyPromptOffset
	/** Clear the current input display */
	private clearInput
	/** Replace input with new content */
	private setInput
	/** Print output and restart the prompt */
	private printAndRestartPrompt
	/** Set cursor position in the input */
	private setCursor
	/** Move cursor by given amount */
	private handleCursorMove
	/** Erase character at cursor */
	private handleCursorErase
	/** Insert text at cursor */
	private handleCursorInsert
	/** Handle input completion (Enter pressed) */
	private handleReadComplete
	/** Handle terminal resize */
	private handleTermResize
	/** Handle terminal data input */
	private handleTermData
	/** Handle a single input character or sequence */
	private handleData
	/** Handle ANSI escape sequences */
	private handleEscapeSequence
	/** Handle control characters */
	private handleControlChar
	/** Handle history navigation (up arrow) */
	private handleHistoryPrevious
	/** Handle history navigation (down arrow) */
	private handleHistoryNext
	/** Handle tab completion */
	private handleTab
	/** Handle Ctrl+C interrupt */
	private handleCtrlC
}
//# sourceMappingURL=LocalEchoController.d.ts.map
