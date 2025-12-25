import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-solid'
import { CursorProvider } from '../../cursor'
import { LineRow } from './LineRow'

const { mockedWarn } = vi.hoisted(() => {
	return { mockedWarn: vi.fn() }
})

vi.mock('@repo/logger', () => ({
	loggers: {
		codeEditor: {
			withTag: () => ({
				warn: mockedWarn,
			}),
		},
	},
}))

describe('LineRow', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		mockedWarn.mockClear()
	})

	it('warns and renders nothing when the line index is invalid', () => {
		const screen = render(() => (
			<CursorProvider
				filePath={() => 'test.ts'}
				isFileSelected={() => true}
				content={() => 'hello'}
				pieceTable={() => undefined}
			>
				<LineRow
					virtualRow={{
						index: 3,
						start: 0,
						size: 20,
						columnStart: 0,
						columnEnd: 4,
					}}
					lineHeight={() => 20}
					contentWidth={() => 200}
					charWidth={() => 8}
					tabSize={() => 2}
					isEditable={() => true}
					onPreciseClick={() => {}}
					activeLineIndex={() => null}
					getLineBracketDepths={() => undefined}
					getLineHighlights={() => undefined}
				/>
			</CursorProvider>
		))

		expect(screen.container.textContent).toBe('')
		expect(mockedWarn).toHaveBeenCalledWith(
			'Line index out of range',
			expect.objectContaining({
				lineIndex: 3,
				lineCount: 1,
				displayIndex: 3,
			})
		)
	})
})
