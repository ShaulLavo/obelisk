import type { Terminal, ITerminalAddon, IDisposable } from 'ghostty-web'
/** Terminal size dimensions */
export interface TerminalSize {
	cols: number
	rows: number
}
/** Position in terminal grid */
export interface TerminalPosition {
	col: number
	row: number
}
/** Prompt configuration for read operations */
export interface PromptConfig {
	prompt: string
	continuationPrompt: string
	resolve: (value: string) => void
	reject: (reason: string) => void
}
/** Character prompt for single-character reads */
export interface CharPromptConfig {
	prompt: string
	resolve: (value: string) => void
	reject: (reason: string) => void
}
/** Autocomplete handler registration */
export interface AutocompleteHandler {
	fn: AutocompleteCallback
	args: unknown[]
}
/** Autocomplete callback function signature */
export type AutocompleteCallback = (
	index: number,
	tokens: string[],
	...args: unknown[]
) => string[]
/** Options for LocalEchoController constructor */
export interface LocalEchoOptions {
	historySize?: number
	maxAutocompleteEntries?: number
}
/** Public interface for LocalEchoController */
export interface ILocalEchoController extends ITerminalAddon {
	/** Print a message with newline */
	println(message: string): void
	/** Print a message */
	print(message: string): void
	/** Print items in wide column format */
	printWide(items: string[], padding?: number): void
	/** Read a line of input from the user */
	read(prompt: string, continuationPrompt?: string): Promise<string>
	/** Read a single character from the user */
	readChar(prompt: string): Promise<string>
	/** Abort any pending read operation */
	abortRead(reason?: string): void
	/** Register an autocomplete handler */
	addAutocompleteHandler(fn: AutocompleteCallback, ...args: unknown[]): void
	/** Remove an autocomplete handler */
	removeAutocompleteHandler(fn: AutocompleteCallback): void
	/** Attach to a terminal */
	attach(): void
	/** Detach from a terminal */
	detach(): void
	/** Activate addon (xterm-compatible API from ghostty-web) */
	activate(term: Terminal): void
	/** Dispose addon (xterm-compatible API from ghostty-web) */
	dispose(): void
}
/** Disposable subscription */
export type Disposable = IDisposable
//# sourceMappingURL=types.d.ts.map
