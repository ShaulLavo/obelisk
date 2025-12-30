import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-solid'
import { createSignal } from 'solid-js'
import { createPieceTableSnapshot, type PieceTableSnapshot } from '@repo/utils'
import { ColorModeProvider } from '@kobalte/core'
import { ThemeProvider } from '@repo/theme'
import { Editor } from '../components/Editor'
import { type TextEditorDocument, CursorMode } from '../types'
import scrollbarStyles from '../minimap/Scrollbar.module.css'

const NATIVE_SCROLLBAR_HIDE_CLASS = scrollbarStyles['scrollbar-hidden']!

// Helper to generate test content with many lines
const generateTestContent = (lineCount: number): string => {
	return Array.from(
		{ length: lineCount },
		(_, i) => `Line ${i + 1}: This is test content for scrolling tests`
	).join('\n')
}

describe('Editor (browser integration)', () => {
	// Helper to create a minimal document for testing
	const createTestDocument = (content: string): TextEditorDocument => {
		const [pieceTable, setPieceTable] = createSignal<
			PieceTableSnapshot | undefined
		>(createPieceTableSnapshot(content))
		return {
			filePath: () => 'test.ts',
			content: () => content,
			pieceTable,
			updatePieceTable: (updater) => {
				setPieceTable(updater(pieceTable()))
			},
			isEditable: () => true,
		}
	}

	// Helper component that renders the Editor
	const TestEditor = (props: { content: string }) => {
		const document = createTestDocument(props.content)
		const [isFileSelected] = createSignal(true)
		const [fontSize] = createSignal(14)
		const [fontFamily] = createSignal('monospace')
		const [cursorMode] = createSignal<CursorMode>(CursorMode.Regular)
		const [stats] = createSignal(undefined)

		return (
			<ColorModeProvider>
				<ThemeProvider>
					<div
						style={{
							width: '800px',
							height: '400px',
							position: 'relative',
							display: 'flex',
							'flex-direction': 'column',
						}}
						data-testid="editor-container"
					>
						<Editor
							document={document}
							isFileSelected={isFileSelected}
							stats={stats}
							fontSize={fontSize}
							fontFamily={fontFamily}
							cursorMode={cursorMode}
						/>
					</div>
				</ThemeProvider>
			</ColorModeProvider>
		)
	}

	// Helper to get the scroll element from the editor
	const getScrollElement = (): HTMLElement | null => {
		// The EditorViewport creates a scrollable div with class 'editor-viewport-scroll'
		const container = document.querySelector('[data-testid="editor-container"]')
		if (!container) return null
		return container.querySelector(
			'.editor-viewport-scroll'
		) as HTMLElement | null
	}

	it('renders the editor with content', async () => {
		const content = generateTestContent(10)
		const screen = render(() => <TestEditor content={content} />)

		// Wait for editor to mount
		const container = screen.getByTestId('editor-container')
		await expect.element(container).toBeVisible()

		// Check that line content is rendered
		await expect.poll(() => screen.getByText('Line 1:').element()).toBeTruthy()
	})

	// TODO: investigate why programmatic scrolling doesn't work in vitest browser
	it.skip('scrolls vertically with many lines', async () => {
		const content = generateTestContent(100) // 100 lines should overflow
		render(() => <TestEditor content={content} />)

		// Wait for scroll element to be available
		let scrollElement: HTMLElement | null = null
		await expect
			.poll(() => {
				scrollElement = getScrollElement()
				return scrollElement !== null
			})
			.toBe(true)

		// Wait for content to be rendered (scrollHeight > clientHeight)
		await expect
			.poll(() => scrollElement!.scrollHeight > scrollElement!.clientHeight)
			.toBe(true)

		// Verify initial scroll position
		expect(scrollElement!.scrollTop).toBe(0)

		// Scroll down - use scrollTo for more reliable behavior
		scrollElement!.scrollTo({ top: 500 })

		// Wait for scroll to take effect
		await expect.poll(() => scrollElement!.scrollTop).toBeGreaterThan(0)

		// Scroll back up
		scrollElement!.scrollTo({ top: 0 })

		await expect.poll(() => scrollElement!.scrollTop).toBe(0)
	})

	it('scroll element has correct overflow behavior', async () => {
		const content = generateTestContent(100)
		render(() => <TestEditor content={content} />)

		// Wait for scroll element
		let scrollElement: HTMLElement | null = null
		await expect
			.poll(() => {
				scrollElement = getScrollElement()
				return scrollElement !== null
			})
			.toBe(true)

		// Check that scrollHeight > clientHeight (content overflows)
		await expect
			.poll(() => scrollElement!.scrollHeight > scrollElement!.clientHeight)
			.toBe(true)
	})

	it('hides native scrollbar when custom scrollbar is active', async () => {
		const content = generateTestContent(100)
		render(() => <TestEditor content={content} />)

		let scrollElement: HTMLElement | null = null
		await expect
			.poll(() => {
				scrollElement = getScrollElement()
				return scrollElement !== null
			})
			.toBe(true)

		await expect
			.poll(() =>
				scrollElement!.classList.contains(NATIVE_SCROLLBAR_HIDE_CLASS)
			)
			.toBe(true)
	})

	// TODO: investigate why programmatic scrolling doesn't work in vitest browser
	it.skip('scroll to bottom shows last lines', async () => {
		const content = generateTestContent(100)
		const screen = render(() => <TestEditor content={content} />)

		// Wait for scroll element
		let scrollElement: HTMLElement | null = null
		await expect
			.poll(() => {
				scrollElement = getScrollElement()
				return scrollElement !== null
			})
			.toBe(true)

		// Wait for content to be rendered
		await expect
			.poll(() => scrollElement!.scrollHeight > scrollElement!.clientHeight)
			.toBe(true)

		// Scroll to bottom using scrollTo API
		const maxScroll = scrollElement!.scrollHeight - scrollElement!.clientHeight
		scrollElement!.scrollTo({ top: maxScroll })

		await expect.poll(() => scrollElement!.scrollTop).toBeGreaterThan(0)

		// Last line should eventually be visible after scroll
		// (Note: may need to wait for virtualized content to update)
		await expect
			.poll(
				() => {
					const lastLineText = screen.getByText(/Line 100:/).element()
					return !!lastLineText
				},
				{ timeout: 2000 }
			)
			.toBe(true)
	})
})
