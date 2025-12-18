import { createMemo, type Accessor } from 'solid-js'
import type { Lexer, LineState } from '@repo/lexer'

export type UseComputedLexerStatesOptions = {
	lexer: Lexer
	lexerLineStates?: Accessor<LineState[] | undefined>
	content: Accessor<string>
}

export const useComputedLexerStates = (options: UseComputedLexerStatesOptions) => {
	const memo = createMemo<LineState[] | undefined>(() => {
		const lexerLineStates = options.lexerLineStates
		const cached = lexerLineStates ? lexerLineStates() : undefined
		if (cached?.length) {
			options.lexer.setLineStates(cached)
			return cached
		}

		const content = options.content()
		if (!content) return undefined
		return options.lexer.computeAllStates(content)
	})

	return memo
}
