export interface Disposable {
	dispose(): void
}

export type OutputMode = 'strict' | 'ansi' | 'none'

export interface TerminalAddonLike {
	activate(term: TerminalLike): void
	dispose(): void
}

export interface TerminalLike {
	cols: number
	rows: number
	write(data: string, callback?: () => void): void
	open(container: HTMLElement): void
	focus(): void
	onData(callback: (data: string) => void): Disposable
	onResize(callback: (size: TerminalSize) => void): Disposable
	loadAddon(addon: TerminalAddonLike): void
	dispose(): void
}

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
	/** Output sanitization mode to protect the terminal renderer. */
	outputMode?: OutputMode
}

/** Public interface for LocalEchoController */
export interface ILocalEchoController extends TerminalAddonLike {
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

	/** Activate addon (xterm-compatible API) */
	activate(term: TerminalLike): void

	/** Dispose addon (xterm-compatible API) */
	dispose(): void
}
