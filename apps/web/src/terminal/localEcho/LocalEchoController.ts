import { HistoryController } from './historyController'
import {
	closestLeftBoundary,
	closestRightBoundary,
	collectAutocompleteCandidates,
	countLines,
	getLastToken,
	getSharedFragment,
	hasTailingWhitespace,
	isIncompleteInput,
	offsetToColRow,
} from './localEchoUtils'
import type {
	AutocompleteCallback,
	AutocompleteHandler,
	CharPromptConfig,
	Disposable,
	ILocalEchoController,
	LocalEchoOptions,
	OutputMode,
	PromptConfig,
	TerminalLike,
	TerminalSize,
} from './types'
import { logger } from '~/logger'

const ANSI = {
	CURSOR_UP: '\x1B[A',
	CURSOR_DOWN: '\x1B[B',
	CURSOR_RIGHT: '\x1B[C',
	CURSOR_LEFT: '\x1B[D',
	CURSOR_NEXT_LINE: '\x1B[E',
	CURSOR_PREV_LINE: '\x1B[F',
	ERASE_LINE: '\x1B[K',
	CARRIAGE_RETURN: '\r',
	NEWLINE: '\r\n',
} as const

const KEY = {
	ESCAPE: 0x1b,
	BACKSPACE: 0x7f,
	ENTER: '\r',
	TAB: '\t',
	CTRL_C: '\x03',
} as const

const ESCAPE_SEQ = {
	UP: '[A',
	DOWN: '[B',
	LEFT: '[D',
	RIGHT: '[C',
	DELETE: '[3~',
	END: '[F',
	HOME: '[H',
	ALT_LEFT: 'b',
	ALT_RIGHT: 'f',
	ALT_BACKSPACE: '\x7F',
} as const

// ANSI strip regex intentionally contains control codes to match escape sequences
// eslint-disable-next-line no-control-regex
const ANSI_COLOR_REGEX = /\u001B\[[0-9;]*m/g
const stripAnsi = (value: string): string => value.replace(ANSI_COLOR_REGEX, '')

// Drop control bytes that crash Ghostty; ANSI mode allows CSI sequences.
const ALLOWED_CONTROL_CODES_STRICT = new Set([0x09, 0x0a, 0x0d])
const CSI_FINAL_MIN = 0x40
const CSI_FINAL_MAX = 0x7e
const CSI_START = 0x5b
const CSI_MAX_LENGTH = 64
const MAX_SANITIZE_LOGS = 3
const MAX_WRITE_LOGS = 3
const WRITE_BACKLOG_LOG_THRESHOLD = 200
const outputLogger = logger.withTag('terminal:output')

const isCsiContinuation = (code: number): boolean =>
	(code >= 0x30 && code <= 0x3f) || (code >= 0x20 && code <= 0x2f)

const readCsiSequenceEnd = (value: string, start: number): number => {
	if (value.charCodeAt(start + 1) !== CSI_START) return 0

	let index = start + 2
	let length = 0

	while (index < value.length && length < CSI_MAX_LENGTH) {
		const code = value.charCodeAt(index)
		length += 1

		if (code >= CSI_FINAL_MIN && code <= CSI_FINAL_MAX) return index + 1
		if (isCsiContinuation(code)) {
			index += 1
			continue
		}

		return 0
	}

	return 0
}

const sanitizeAnsiOutput = (value: string): string => {
	let sanitized = ''
	let changed = false

	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i)

		if (code === KEY.ESCAPE) {
			const end = readCsiSequenceEnd(value, i)
			if (end > 0) {
				sanitized += value.slice(i, end)
				i = end - 1
				continue
			}
			changed = true
			continue
		}

		const isAsciiControl = code < 0x20 || code === 0x7f
		const isC1Control = code >= 0x80 && code <= 0x9f
		const isBlocked =
			(isAsciiControl && !ALLOWED_CONTROL_CODES_STRICT.has(code)) || isC1Control

		if (isBlocked) {
			changed = true
			continue
		}

		sanitized += value[i]
	}

	return changed ? sanitized : value
}

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
export class LocalEchoController implements ILocalEchoController {
	private term: TerminalLike | null = null
	private history: HistoryController
	private maxAutocompleteEntries: number

	private autocompleteHandlers: AutocompleteHandler[] = []
	private active = false
	private input = ''
	private cursor = 0
	private activePrompt: PromptConfig | null = null
	private activeCharPrompt: CharPromptConfig | null = null
	private termSize: TerminalSize = { cols: 0, rows: 0 }
	private disposables: Disposable[] = []
	private sanitizeLogCount = 0
	private writeLogCount = 0
	private pendingWrite: Promise<void> = Promise.resolve()
	private pendingWriteCount = 0

	private promptVisible = ''
	private continuationVisible = ''
	private outputMode: OutputMode

	constructor(options: LocalEchoOptions = {}) {
		this.history = new HistoryController(options.historySize ?? 10)
		this.maxAutocompleteEntries = options.maxAutocompleteEntries ?? 100
		this.outputMode = options.outputMode ?? 'strict'
	}

	activate(term: TerminalLike): void {
		this.term = term
		this.attach()
	}

	dispose(): void {
		this.detach()
	}

	/** Detach the controller from the terminal */
	detach(): void {
		for (const d of this.disposables) {
			d.dispose()
		}
		this.disposables = []
	}

	/** Attach controller to the terminal */
	attach(): void {
		if (!this.term) return

		this.disposables.push(this.term.onData(this.handleTermData))
		this.disposables.push(this.term.onResize(this.handleTermResize))

		this.termSize = {
			cols: this.term.cols,
			rows: this.term.rows,
		}
	}

	/** Register an autocomplete handler */
	addAutocompleteHandler(fn: AutocompleteCallback, ...args: unknown[]): void {
		this.autocompleteHandlers.push({ fn, args })
	}

	/** Remove a previously registered autocomplete handler */
	removeAutocompleteHandler(fn: AutocompleteCallback): void {
		const idx = this.autocompleteHandlers.findIndex((h) => h.fn === fn)
		if (idx !== -1) {
			this.autocompleteHandlers.splice(idx, 1)
		}
	}

	/**
	 * Read a line of input from the user.
	 * Returns a promise that resolves when Enter is pressed.
	 */
	read(prompt: string, continuationPrompt = '> '): Promise<string> {
		return new Promise((resolve, reject) => {
			this.writeImmediate(prompt)
			this.promptVisible = stripAnsi(prompt)
			this.continuationVisible = stripAnsi(continuationPrompt)
			this.activePrompt = { prompt, continuationPrompt, resolve, reject }
			this.input = ''
			this.cursor = 0
			this.active = true
		})
	}

	/**
	 * Read a single character from the user.
	 * Takes priority over any active read() operation.
	 */
	readChar(prompt: string): Promise<string> {
		return new Promise((resolve, reject) => {
			this.writeImmediate(prompt)
			this.activeCharPrompt = { prompt, resolve, reject }
		})
	}

	/** Abort any pending read operation */
	abortRead(reason = 'aborted', skipWrite = false): void {
		if (!skipWrite && (this.activePrompt || this.activeCharPrompt)) {
			this.writeImmediate(ANSI.NEWLINE)
		}

		if (this.activePrompt) {
			this.activePrompt.reject(reason)
			this.activePrompt = null
		}

		if (this.activeCharPrompt) {
			this.activeCharPrompt.reject(reason)
			this.activeCharPrompt = null
		}

		this.active = false
		this.promptVisible = ''
		this.continuationVisible = ''
	}

	/** Print a message followed by newline */
	println(message: string): void {
		this.print(message + '\n')
	}

	/** Print a message, converting newlines properly */
	print(message: string): void {
		this.enqueueWrite(this.formatOutput(message))
	}

	/** Wait for any queued output to finish rendering. */
	async flushOutput(): Promise<void> {
		await this.pendingWrite
	}

	private formatOutput(message: string): string {
		const normalized = this.sanitizeOutput(message).replace(/[\r\n]+/g, '\n')
		return normalized.replace(/\n/g, ANSI.NEWLINE)
	}

	private writeImmediate(message: string): void {
		this.term?.write(this.formatOutput(message))
	}

	private enqueueWrite(data: string): void {
		if (!this.term) return

		this.pendingWriteCount += 1
		if (
			this.pendingWriteCount >= WRITE_BACKLOG_LOG_THRESHOLD &&
			this.writeLogCount < MAX_WRITE_LOGS
		) {
			this.writeLogCount += 1
			outputLogger.debug('Terminal output backlog', {
				pendingWrites: this.pendingWriteCount,
				length: data.length,
			})
		}

		const write = () =>
			new Promise<void>((resolve) => {
				if (!this.term) {
					resolve()
					return
				}
				try {
					this.term.write(data, resolve)
				} catch (error) {
					const details =
						error instanceof Error
							? { message: error.message, stack: error.stack }
							: { message: String(error) }
					outputLogger.error('Terminal write failed', details)
					resolve()
				}
			})

		this.pendingWrite = this.pendingWrite
			.catch(() => undefined)
			.then(write)
			.finally(() => {
				this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1)
			})
	}

	private sanitizeOutput(value: string): string {
		if (this.outputMode === 'none') return value

		if (this.outputMode === 'ansi') {
			const sanitized = sanitizeAnsiOutput(value)
			if (sanitized !== value) {
				this.sanitizeLogCount += 1
				if (this.sanitizeLogCount <= MAX_SANITIZE_LOGS) {
					outputLogger.debug('Sanitized terminal output', {
						length: value.length,
					})
				} else if (this.sanitizeLogCount === MAX_SANITIZE_LOGS + 1) {
					outputLogger.debug('Sanitized terminal output (suppressed)')
				}
			}
			return sanitized
		}

		let sanitized = ''
		let changed = false

		for (let i = 0; i < value.length; i++) {
			const code = value.charCodeAt(i)
			const isAsciiControl = code < 0x20 || code === 0x7f
			const isC1Control = code >= 0x80 && code <= 0x9f
			const isBlocked =
				(isAsciiControl && !ALLOWED_CONTROL_CODES_STRICT.has(code)) ||
				isC1Control

			if (isBlocked) {
				changed = true
				continue
			}

			sanitized += value[i]
		}

		return changed ? sanitized : value
	}

	/** Print items in wide column format */
	printWide(items: string[], padding = 2): void {
		if (items.length === 0) {
			this.println('')
			return
		}

		const maxWidth = Math.max(...items.map((item) => item.length))
		const itemWidth = maxWidth + padding
		const cols = Math.floor(this.termSize.cols / itemWidth)
		const rows = Math.ceil(items.length / cols)

		let itemIndex = 0
		for (let row = 0; row < rows; row++) {
			let rowStr = ''
			for (let col = 0; col < cols && itemIndex < items.length; col++) {
				const item = items[itemIndex++]
				rowStr += item?.padEnd(itemWidth)
			}
			this.println(rowStr)
		}
	}

	/** Apply prompt prefixes to input for display */
	private applyPrompts(input: string, mode: 'raw' | 'visible' = 'raw'): string {
		const prompt =
			mode === 'raw'
				? (this.activePrompt?.prompt ?? '')
				: this.promptVisible || stripAnsi(this.activePrompt?.prompt ?? '')
		const continuation =
			mode === 'raw'
				? (this.activePrompt?.continuationPrompt ?? '')
				: this.continuationVisible ||
					stripAnsi(this.activePrompt?.continuationPrompt ?? '')
		return prompt + input.replace(/\n/g, '\n' + continuation)
	}

	/** Calculate display offset accounting for prompt length */
	private applyPromptOffset(input: string, offset: number): number {
		const withPrompt = this.applyPrompts(input.substring(0, offset), 'visible')
		return withPrompt.length
	}

	/** Clear the current input display */
	private clearInput(): void {
		const currentPrompt = this.applyPrompts(this.input, 'visible')
		const allRows = countLines(currentPrompt, this.termSize.cols)

		const promptCursor = this.applyPromptOffset(this.input, this.cursor)
		const { row } = offsetToColRow(
			currentPrompt,
			promptCursor,
			this.termSize.cols
		)

		// Move to the last row
		const moveRows = allRows - row - 1
		for (let i = 0; i < moveRows; i++) {
			this.term?.write(ANSI.CURSOR_NEXT_LINE)
		}

		// Clear all lines
		this.term?.write(ANSI.CARRIAGE_RETURN + ANSI.ERASE_LINE)
		for (let i = 1; i < allRows; i++) {
			this.term?.write(ANSI.CURSOR_PREV_LINE + ANSI.ERASE_LINE)
		}
	}

	/** Replace input with new content */
	private setInput(newInput: string, clearFirst = true): void {
		if (clearFirst) this.clearInput()

		const renderedPrompt = this.applyPrompts(newInput)
		const visiblePrompt = this.applyPrompts(newInput, 'visible')
		this.writeImmediate(renderedPrompt)

		if (this.cursor > newInput.length) {
			this.cursor = newInput.length
		}

		const newCursor = this.applyPromptOffset(newInput, this.cursor)
		const newLines = countLines(visiblePrompt, this.termSize.cols)
		const { col, row } = offsetToColRow(
			visiblePrompt,
			newCursor,
			this.termSize.cols
		)
		const moveUpRows = newLines - row - 1

		this.term?.write(ANSI.CARRIAGE_RETURN)
		for (let i = 0; i < moveUpRows; i++) {
			this.term?.write(ANSI.CURSOR_PREV_LINE)
		}
		for (let i = 0; i < col; i++) {
			this.term?.write(ANSI.CURSOR_RIGHT)
		}

		this.input = newInput
	}

	/** Print output and restart the prompt */
	private printAndRestartPrompt(callback: () => void | Promise<void>): void {
		const savedCursor = this.cursor

		this.setCursor(this.input.length)
		this.term?.write(ANSI.NEWLINE)

		const resume = async () => {
			await this.flushOutput()
			this.cursor = savedCursor
			this.setInput(this.input)
		}

		const result = callback()
		if (result instanceof Promise) {
			void result.then(() => resume())
		} else {
			void resume()
		}
	}

	/** Set cursor position in the input */
	private setCursor(newCursor: number): void {
		newCursor = Math.max(0, Math.min(newCursor, this.input.length))

		const inputWithPrompt = this.applyPrompts(this.input, 'visible')

		const prevOffset = this.applyPromptOffset(this.input, this.cursor)
		const { col: prevCol, row: prevRow } = offsetToColRow(
			inputWithPrompt,
			prevOffset,
			this.termSize.cols
		)

		const newOffset = this.applyPromptOffset(this.input, newCursor)
		const { col: newCol, row: newRow } = offsetToColRow(
			inputWithPrompt,
			newOffset,
			this.termSize.cols
		)

		// Move vertically
		if (newRow > prevRow) {
			for (let i = prevRow; i < newRow; i++) this.term?.write(ANSI.CURSOR_DOWN)
		} else {
			for (let i = newRow; i < prevRow; i++) this.term?.write(ANSI.CURSOR_UP)
		}

		// Move horizontally
		if (newCol > prevCol) {
			for (let i = prevCol; i < newCol; i++) this.term?.write(ANSI.CURSOR_RIGHT)
		} else {
			for (let i = newCol; i < prevCol; i++) this.term?.write(ANSI.CURSOR_LEFT)
		}

		this.cursor = newCursor
	}

	/** Move cursor by given amount */
	private handleCursorMove(direction: number): void {
		if (direction > 0) {
			const delta = Math.min(direction, this.input.length - this.cursor)
			this.setCursor(this.cursor + delta)
		} else if (direction < 0) {
			const delta = Math.max(direction, -this.cursor)
			this.setCursor(this.cursor + delta)
		}
	}

	/** Erase character at cursor */
	private handleCursorErase(backspace: boolean): void {
		if (backspace) {
			if (this.cursor <= 0) return
			const newInput =
				this.input.substring(0, this.cursor - 1) +
				this.input.substring(this.cursor)
			this.clearInput()
			this.cursor -= 1
			this.setInput(newInput, false)
		} else {
			const newInput =
				this.input.substring(0, this.cursor) +
				this.input.substring(this.cursor + 1)
			this.setInput(newInput)
		}
	}

	/** Insert text at cursor */
	private handleCursorInsert(data: string): void {
		const newInput =
			this.input.substring(0, this.cursor) +
			data +
			this.input.substring(this.cursor)
		this.cursor += data.length
		this.setInput(newInput)
	}

	/** Handle input completion (Enter pressed) */
	private handleReadComplete(): void {
		this.history.push(this.input)

		if (this.activePrompt) {
			this.activePrompt.resolve(this.input)
			this.activePrompt = null
		}

		this.term?.write(ANSI.NEWLINE)
		this.active = false
		this.promptVisible = ''
		this.continuationVisible = ''
	}

	/** Handle terminal resize */
	private handleTermResize = (data: { rows: number; cols: number }): void => {
		// Only redraw input if we're in an active input session
		if (!this.active) {
			this.termSize = { cols: data.cols, rows: data.rows }
			return
		}
		try {
			this.clearInput()
			this.termSize = { cols: data.cols, rows: data.rows }
			this.setInput(this.input, false)
		} catch {
			// Silently ignore WASM memory errors during resize
			// The terminal will recover on next user interaction
			this.termSize = { cols: data.cols, rows: data.rows }
		}
	}

	/** Handle terminal data input */
	private handleTermData = (data: string): void => {
		if (!this.active) return

		// Character prompt takes priority
		if (this.activeCharPrompt) {
			this.activeCharPrompt.resolve(data)
			this.activeCharPrompt = null
			this.term?.write(ANSI.NEWLINE)
			return
		}

		// Handle pasted input
		if (data.length > 3 && data.charCodeAt(0) !== KEY.ESCAPE) {
			const normalized = data.replace(/[\r\n]+/g, '\r')
			let buffer = ''
			for (const char of normalized) {
				if (!this.active) break
				const ord = char.charCodeAt(0)
				const isControl = ord < 32 || ord === KEY.BACKSPACE || ord === KEY.ESCAPE
				if (isControl) {
					if (buffer) {
						this.handleCursorInsert(buffer)
						buffer = ''
					}
					this.handleData(char)
					continue
				}
				buffer += char
			}
			if (buffer && this.active) {
				this.handleCursorInsert(buffer)
			}
		} else {
			this.handleData(data)
		}
	}

	/** Handle a single input character or sequence */
	private handleData(data: string): void {
		if (!this.active) return

		const ord = data.charCodeAt(0)

		// Handle escape sequences
		if (ord === KEY.ESCAPE) {
			this.handleEscapeSequence(data.substring(1))
			return
		}

		// Handle control characters
		if (ord < 32 || ord === KEY.BACKSPACE) {
			this.handleControlChar(data)
			return
		}

		// Insert visible character
		this.handleCursorInsert(data)
	}

	/** Handle ANSI escape sequences */
	private handleEscapeSequence(seq: string): void {
		switch (seq) {
			case ESCAPE_SEQ.UP:
				this.handleHistoryPrevious()
				break

			case ESCAPE_SEQ.DOWN:
				this.handleHistoryNext()
				break

			case ESCAPE_SEQ.LEFT:
				this.handleCursorMove(-1)
				break

			case ESCAPE_SEQ.RIGHT:
				this.handleCursorMove(1)
				break

			case ESCAPE_SEQ.DELETE:
				this.handleCursorErase(false)
				break

			case ESCAPE_SEQ.END:
				this.setCursor(this.input.length)
				break

			case ESCAPE_SEQ.HOME:
				this.setCursor(0)
				break

			case ESCAPE_SEQ.ALT_LEFT: {
				const pos = closestLeftBoundary(this.input, this.cursor)
				this.setCursor(pos)
				break
			}

			case ESCAPE_SEQ.ALT_RIGHT: {
				const pos = closestRightBoundary(this.input, this.cursor)
				this.setCursor(pos)
				break
			}

			case ESCAPE_SEQ.ALT_BACKSPACE: {
				const pos = closestLeftBoundary(this.input, this.cursor)
				this.setInput(
					this.input.substring(0, pos) + this.input.substring(this.cursor)
				)
				this.setCursor(pos)
				break
			}
		}
	}

	/** Handle control characters */
	private handleControlChar(data: string): void {
		switch (data) {
			case KEY.ENTER:
				if (isIncompleteInput(this.input)) {
					this.handleCursorInsert('\n')
				} else {
					this.handleReadComplete()
				}
				break

			case String.fromCharCode(KEY.BACKSPACE):
				this.handleCursorErase(true)
				break

			case KEY.TAB:
				this.handleTab()
				break

			case KEY.CTRL_C:
				this.handleCtrlC()
				break
		}
	}

	/** Handle history navigation (up arrow) */
	private handleHistoryPrevious(): void {
		const value = this.history.getPrevious()
		if (value) {
			this.setInput(value)
			this.setCursor(value.length)
		}
	}

	/** Handle history navigation (down arrow) */
	private handleHistoryNext(): void {
		const value = this.history.getNext() ?? ''
		this.setInput(value)
		this.setCursor(value.length)
	}

	/** Handle tab completion */
	private handleTab(): void {
		if (this.autocompleteHandlers.length === 0) {
			this.handleCursorInsert('    ')
			return
		}

		const inputFragment = this.input.substring(0, this.cursor)
		const hasTrailingSpace = hasTailingWhitespace(inputFragment)
		const candidates = collectAutocompleteCandidates(
			this.autocompleteHandlers,
			inputFragment
		)

		candidates.sort()

		if (candidates.length === 0) {
			if (!hasTrailingSpace) {
				this.handleCursorInsert(' ')
			}
		} else if (candidates.length === 1) {
			const lastToken = getLastToken(inputFragment)
			this.handleCursorInsert(candidates[0]?.substring(lastToken.length) + ' ')
		} else if (candidates.length <= this.maxAutocompleteEntries) {
			const sharedFragment = getSharedFragment(inputFragment, candidates)

			if (sharedFragment) {
				const lastToken = getLastToken(inputFragment)
				this.handleCursorInsert(sharedFragment.substring(lastToken.length))
			}

			this.printAndRestartPrompt(() => {
				this.printWide(candidates)
			})
		} else {
			this.printAndRestartPrompt(async () => {
				const answer = await this.readChar(
					`Display all ${candidates.length} possibilities? (y or n)`
				)
				if (answer === 'y' || answer === 'Y') {
					this.printWide(candidates)
				}
			})
		}
	}

	/** Handle Ctrl+C interrupt */
	private handleCtrlC(): void {
		this.setCursor(this.input.length)
		const prompt = this.activePrompt?.prompt ?? ''
		this.term?.write('^C' + ANSI.NEWLINE + prompt)
		this.input = ''
		this.cursor = 0
		this.history.rewind()
	}
}
