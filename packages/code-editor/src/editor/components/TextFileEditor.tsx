import { createMemo } from 'solid-js'
import { CursorProvider } from '../cursor'
import { HistoryProvider } from '../history'
import { TextFileEditorInner } from './TextFileEditorInner'
import { quickTokenizeLine } from '../utils/quickLexer'
import type { BracketDepthMap, TextFileEditorProps } from '../types'

export const TextFileEditor = (props: TextFileEditorProps) => {
	// Convert tree-sitter BracketInfo[] to BracketDepthMap
	const treeSitterBracketDepths = createMemo<BracketDepthMap | undefined>(
		() => {
			const brackets = props.brackets?.()
			if (!brackets || brackets.length === 0) return undefined
			const depthMap: BracketDepthMap = {}
			for (const bracket of brackets) {
				depthMap[bracket.index] = bracket.depth
			}
			return depthMap
		}
	)

	const quickLexerBracketDepths = createMemo<BracketDepthMap | undefined>(
		() => {
			const content = props.document.content()
			if (!content) return undefined

			const lines = content.split('\n')
			const depthMap: BracketDepthMap = {}
			let state = 0 // LexState.Normal
			let bracketDepth = 0
			let documentOffset = 0

			for (const lineText of lines) {
				const result = quickTokenizeLine(
					lineText,
					state,
					bracketDepth,
					documentOffset
				)

				// Collect brackets from this line
				for (const bracket of result.brackets) {
					depthMap[bracket.index] = bracket.depth
				}

				// Update state for next line
				state = result.endState
				bracketDepth = result.endBracketDepth
				// Add line length + 1 for newline character
				documentOffset += lineText.length + 1
			}

			return Object.keys(depthMap).length > 0 ? depthMap : undefined
		}
	)

	// Use tree-sitter brackets if available, otherwise fall back to quick lexer
	const bracketDepths = createMemo<BracketDepthMap | undefined>(() => {
		return treeSitterBracketDepths() ?? quickLexerBracketDepths()
	})

	return (
		<CursorProvider
			filePath={props.document.filePath}
			isFileSelected={props.isFileSelected}
			content={props.document.content}
			pieceTable={props.document.pieceTable}
		>
			<HistoryProvider document={props.document}>
				<TextFileEditorInner
					{...props}
					bracketDepths={bracketDepths}
					folds={props.folds}
				/>
			</HistoryProvider>
		</CursorProvider>
	)
}
