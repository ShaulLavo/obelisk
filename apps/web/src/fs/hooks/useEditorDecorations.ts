import type { EditorSyntaxHighlight, HighlightOffsets } from '@repo/code-editor'
import { getHighlightClassForScope } from '@repo/code-editor'
import { createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import { unwrap } from 'solid-js/store'
import type {
	TreeSitterCapture,
	TreeSitterError,
} from '../../workers/treeSitter/types'
import type { HighlightTransform } from '../store/types'

type UseEditorDecorationsParams = {
	highlights: Accessor<TreeSitterCapture[] | undefined>
	highlightOffsets: Accessor<HighlightTransform[] | undefined>
	errors: Accessor<TreeSitterError[] | undefined>
	isFileSelected: Accessor<boolean>
	filePath: Accessor<string | undefined>
}

export const useEditorDecorations = (params: UseEditorDecorationsParams) => {
	const editorHighlights = createMemo<EditorSyntaxHighlight[] | undefined>(
		() => {
			const captures = params.highlights()
			if (!captures || captures.length === 0) {
				return undefined
			}

			const unwrapped = unwrap(captures)
			const next: EditorSyntaxHighlight[] = []

			for (let i = 0; i < unwrapped.length; i += 1) {
				const capture = unwrapped[i]
				if (!capture) continue

				const className =
					capture.className ?? getHighlightClassForScope(capture.scope)

				next.push({
					startIndex: capture.startIndex,
					endIndex: capture.endIndex,
					scope: capture.scope,
					className,
				})
			}

			return next
		}
	)

	const editorHighlightOffset = createMemo<HighlightOffsets | undefined>(() => {
		const offsets = params.highlightOffsets()
		if (!offsets?.length) return undefined

		const unwrapped = unwrap(offsets)
		return unwrapped.map((offset) => ({
			charDelta: offset.charDelta,
			lineDelta: offset.lineDelta,
			fromCharIndex: offset.fromCharIndex,
			fromLineRow: offset.fromLineRow,
			oldEndRow: offset.oldEndRow,
			newEndRow: offset.newEndRow,
			oldEndIndex: offset.oldEndIndex,
			newEndIndex: offset.newEndIndex,
		}))
	})

	const editorErrors = createMemo(() => params.errors())

	return { editorHighlights, editorHighlightOffset, editorErrors }
}
