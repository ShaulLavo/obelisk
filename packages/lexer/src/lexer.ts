/**
 * Unified Lexer Class
 *
 * Manages state for incremental highlighting, delegating core logic to tokenizer.ts.
 */

import { tokenizeLine } from './tokenizer'
import {
	type Token,
	type LineState,
	type TokenizeResult,
	type ScmRules,
	LexState,
} from './types'
import { DEFAULT_KEYWORDS, DEFAULT_REGEX_RULES } from './consts'

// Re-export for convenience
export { LexState }

/**
 * Line highlight segment for rendering
 */
export type LineHighlightSegment = {
	start: number
	end: number
	className: string
	scope: string
}

const DEFAULT_RULES: ScmRules = {
	keywords: DEFAULT_KEYWORDS,
	regexRules: DEFAULT_REGEX_RULES,
}

const EMPTY_RULES: ScmRules = {
	keywords: new Map(),
	regexRules: [],
}

/**
 * Unified Lexer class that provides state management around the pure tokenizer.
 */
export class Lexer {
	private readonly keywords: Map<string, string>
	private readonly regexRules: { pattern: RegExp; scope: string }[]
	private lineStates: LineState[] = []

	private constructor(rules: ScmRules) {
		this.keywords = rules.keywords
		this.regexRules = rules.regexRules
	}

	/**
	 * Check if the lexer has SCM rules loaded.
	 * Returns false for empty/no-op lexers (used for unknown file types).
	 */
	hasRules(): boolean {
		return this.keywords.size > 0 || this.regexRules.length > 0
	}

	/**
	 * Create a lexer with the given SCM rules
	 */
	static create(rules: ScmRules = DEFAULT_RULES): Lexer {
		return new Lexer(rules)
	}

	/**
	 * Create an empty lexer with no rules (plain text mode).
	 * Use this for files with unknown extensions.
	 */
	static createEmpty(): Lexer {
		return new Lexer(EMPTY_RULES)
	}

	/**
	 * Create a lexer from SCM query source strings
	 */
	static fromScmSources(
		parseScmQuery: (source: string) => ScmRules,
		mergeScmRules: (...rules: ScmRules[]) => ScmRules,
		...sources: string[]
	): Lexer {
		const rules = sources.map(parseScmQuery)
		return new Lexer(mergeScmRules(...rules))
	}

	/**
	 * Get the initial state for line 0
	 */
	static initialState(): LineState {
		return { lexState: LexState.Normal, bracketDepth: 0, offset: 0 }
	}

	/**
	 * Compare two line states for equality (ignoring offset)
	 */
	static statesEqual(a: LineState, b: LineState): boolean {
		return a.lexState === b.lexState && a.bracketDepth === b.bracketDepth
	}

	/**
	 * Tokenize a single line with the given starting state.
	 * If no SCM rules are loaded, returns empty tokens (plain text mode).
	 */
	tokenizeLine(
		line: string,
		state: LineState = Lexer.initialState()
	): TokenizeResult {
		// No rules means plain text - skip tokenization
		if (!this.hasRules()) {
			return {
				tokens: [],
				brackets: [],
				endState: {
					...state,
					offset: state.offset + line.length + 1,
				},
			}
		}
		return tokenizeLine(line, state, this.keywords, this.regexRules)
	}

	/**
	 * Compute line-start states for entire content.
	 * Stores results internally and returns the states array.
	 */
	computeAllStates(content: string): LineState[] {
		const lines = content.split('\n')
		const states: LineState[] = []

		let state = Lexer.initialState()

		for (let i = 0; i < lines.length; i++) {
			states.push(state)

			const lineText = lines[i]!
			const result = this.tokenizeLine(lineText, state)

			state = result.endState
		}

		this.lineStates = states
		return states
	}

	/**
	 * Get the cached state for a line
	 */
	getLineState(lineIndex: number): LineState | undefined {
		return this.lineStates[lineIndex]
	}

	/**
	 * Get all cached line states
	 */
	getAllLineStates(): LineState[] {
		return this.lineStates
	}

	/**
	 * Set line states directly (e.g., from external cache)
	 */
	setLineStates(states: LineState[]): void {
		this.lineStates = states
	}

	/**
	 * Incrementally update line states after an edit.
	 */
	updateStatesFromEdit(
		editedLineIndex: number,
		getLineText: (index: number) => string,
		lineCount: number
	): LineState[] {
		const oldLineCount = this.lineStates.length
		const newStates = [...this.lineStates]
		const insertedLineCount = Math.max(0, lineCount - oldLineCount)
		const firstOriginalLineIndexAfterInsertion =
			insertedLineCount > 0 ? editedLineIndex + 1 + insertedLineCount : -1

		if (lineCount > oldLineCount) {
			// Lines were inserted - add placeholder states
			const insertAt = editedLineIndex + 1
			for (let i = 0; i < insertedLineCount; i++) {
				newStates.splice(insertAt, 0, Lexer.initialState())
			}
		} else if (lineCount < oldLineCount) {
			// Lines were deleted
			const deleteCount = oldLineCount - lineCount
			newStates.splice(editedLineIndex + 1, deleteCount)
		}

		// Start from edited line and propagate until states match
		let currentLine = editedLineIndex
		const isFirstLine = currentLine === 0
		const isOutOfRange = currentLine >= newStates.length
		const hasState = Boolean(newStates[currentLine])

		let state =
			isFirstLine || isOutOfRange || !hasState
				? Lexer.initialState()
				: newStates[currentLine]!

		while (currentLine < lineCount) {
			newStates[currentLine] = state

			const lineText = getLineText(currentLine)
			const result = this.tokenizeLine(lineText, state)

			const nextState = result.endState
			currentLine++

			// Check if we can stop early
			const hasNextLine =
				currentLine < lineCount && currentLine < newStates.length
			const hasInsertedLines = insertedLineCount > 0
			const isBeforeFirstOriginalLineAfterInsertion =
				hasInsertedLines && currentLine < firstOriginalLineIndexAfterInsertion
			const canEarlyStop =
				hasNextLine && isBeforeFirstOriginalLineAfterInsertion === false

			if (canEarlyStop) {
				const cachedNext = newStates[currentLine]!
				if (Lexer.statesEqual(cachedNext, nextState)) {
					// States match - update offsets for remaining lines
					const offsetDelta = nextState.offset - cachedNext.offset
					if (offsetDelta !== 0) {
						for (let i = currentLine; i < newStates.length; i++) {
							newStates[i] = {
								...newStates[i]!,
								offset: newStates[i]!.offset + offsetDelta,
							}
						}
					}
					break
				}
			}

			state = nextState
		}

		this.lineStates = newStates
		return newStates
	}

	/**
	 * Convert tokens to LineHighlightSegment format
	 */
	tokensToSegments(
		tokens: Token[],
		getClass: (scope: string) => string | undefined
	): LineHighlightSegment[] {
		const segments: LineHighlightSegment[] = []
		for (const token of tokens) {
			const className = getClass(token.scope)
			if (className) {
				segments.push({
					start: token.start,
					end: token.end,
					className,
					scope: token.scope,
				})
			}
		}
		return segments
	}
}
