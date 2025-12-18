import { createMemo, onCleanup, type Accessor } from 'solid-js'
import { Lexer, type LineState } from '@repo/lexer'
import type { BracketDepthMap, VirtualItem } from '../types'

export type UseVisibleBracketDepthsOptions = {
	lexer: Lexer
	treeSitterBracketDepths: Accessor<BracketDepthMap | undefined>
	lexerStates: Accessor<LineState[] | undefined>
	virtualItems: Accessor<VirtualItem[]>
	displayToLine: (displayIndex: number) => number
	getLineText: (lineIndex: number) => string
}

export const useVisibleBracketDepths = (
	options: UseVisibleBracketDepthsOptions
) => {
	type CachedLineBrackets = {
		lineText: string
		brackets: { index: number; depth: number }[]
	}

	const lineCache = new Map<number, CachedLineBrackets>()

	onCleanup(() => {
		lineCache.clear()
	})

	const memo = createMemo<BracketDepthMap | undefined>(() => {
		const treeSitterDepths = options.treeSitterBracketDepths()
		if (treeSitterDepths) return treeSitterDepths

		const lexerStates = options.lexerStates()
		if (!lexerStates?.length) return undefined

		const depthMap: BracketDepthMap = {}
		let hasBrackets = false

		const items = options.virtualItems()
		for (const item of items) {
			const lineIndex = options.displayToLine(item.index)
			if (lineIndex < 0 || lineIndex >= lexerStates.length) continue

			const lineText = options.getLineText(lineIndex)

			let cached = lineCache.get(lineIndex)
			if (!cached || cached.lineText !== lineText) {
				const startState =
					options.lexer.getLineState(lineIndex) ?? Lexer.initialState()
				const { brackets } = options.lexer.tokenizeLine(lineText, startState)
				cached = { lineText, brackets }
				lineCache.set(lineIndex, cached)
			}

			for (const bracket of cached.brackets) {
				hasBrackets = true
				depthMap[bracket.index] = bracket.depth
			}
		}

		return hasBrackets ? depthMap : undefined
	})

	return memo
}
