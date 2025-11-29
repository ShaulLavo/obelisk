import type { ITerminalAddon, Terminal } from '@xterm/xterm'

interface LocalEchoOptions {
	historySize?: number
	maxAutocompleteEntries?: number
}

declare module 'local-echo' {
	export default class LocalEchoController implements ITerminalAddon {
		constructor(term?: Terminal, options?: LocalEchoOptions)
		activate(term: Terminal): void
		dispose(): void
		read(prompt: string, continuationPrompt?: string): Promise<string>
		readChar(prompt: string): Promise<string>
		abortRead(reason?: string): void
		print(message?: string): void
		println(message?: string): void
		printWide(items: string[], padding?: number): void
		addAutocompleteHandler(fn: (...args: any[]) => string[], ...args: any[]): void
		removeAutocompleteHandler(fn: (...args: any[]) => string[]): void
	}
}
