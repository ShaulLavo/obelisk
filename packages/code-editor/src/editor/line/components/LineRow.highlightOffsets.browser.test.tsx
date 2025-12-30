import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { batch, createSignal } from 'solid-js'
import { render } from 'vitest-browser-solid'
import { waitForFrames } from '../../benchmarks/utils/performanceMetrics'
import {
	createPieceTableSnapshot,
	deleteFromPieceTable,
	insertIntoPieceTable,
	type PieceTableSnapshot,
} from '@repo/utils'
import { getEditCharDelta, getEditLineDelta } from '@repo/utils/highlightShift'
import { ColorModeProvider } from '@kobalte/core'
import { ThemeProvider } from '@repo/theme'
import { Editor } from '../../components/Editor'
//@ts-expect-error idk
import sqliteContent from '../../../../../../sqlite.js?raw'
import {
	disposeTreeSitterWorker,
	parseBufferWithTreeSitter,
} from '../../../../../../apps/web/src/treeSitter/workerClient'
import {
	CursorMode,
	type EditorSyntaxHighlight,
	type HighlightOffsets,
	type TextEditorDocument,
} from '../../types'

type BuildTextRuns = typeof import('../utils/textRuns').buildTextRuns

const buildTextRunsCalls = vi.hoisted(() => [] as string[])
vi.mock('../utils/textRuns', async () => {
	const actual =
		await vi.importActual<typeof import('../utils/textRuns')>(
			'../utils/textRuns'
		)

	const buildTextRuns: BuildTextRuns = (
		text,
		depthMap,
		highlights,
		startIndex,
		endIndex
	) => {
		buildTextRunsCalls.push(text)
		return actual.buildTextRuns(
			text,
			depthMap,
			highlights,
			startIndex,
			endIndex
		)
	}

	return {
		...actual,
		buildTextRuns,
	}
})

type FileState = {
	path: string
	content: string
	highlights?: EditorSyntaxHighlight[]
}

type HarnessHandle = {
	switchFile: (next: FileState) => void
	typeAt: (lineIndex: number, column: number, text: string) => void
	setHighlights: (highlights: EditorSyntaxHighlight[] | undefined) => void
	container: HTMLDivElement
	getContent: () => string
	unmount: () => void
}

const jsContent = [
	'const value0 = 0 // L0',
	'const value1 = 1 // L1',
	'export const user = { // L2',
	'\tid: 1, // L3',
	'\tname: "Ada" // L4',
	'} // L5',
	'export function greet(user) { // L6',
	'\tconst message = "Hello, " + user.name // L7',
	'\treturn message // L8',
	'} // L9',
].join('\n')

const textEncoder = new TextEncoder()
const highlightCache = new Map<string, EditorSyntaxHighlight[]>()

const getTreeSitterHighlights = async (
	path: string,
	content: string
): Promise<EditorSyntaxHighlight[]> => {
	const cached = highlightCache.get(path)
	if (cached) return cached

	const buffer = textEncoder.encode(content).buffer
	const result = await parseBufferWithTreeSitter(path, buffer)
	if (!result) {
		throw new Error(`Tree-sitter parse failed for ${path}`)
	}
	if (result.captures.length === 0) {
		throw new Error(`Tree-sitter returned no highlights for ${path}`)
	}

	highlightCache.set(path, result.captures)
	return result.captures
}

const collectBuildTextRunsLines = (calls: string[], content: string) => {
	const lines = content.split('\n')
	const lookup = new Map<string, number>()
	for (let i = 0; i < lines.length; i++) {
		lookup.set(lines[i] ?? '', i)
	}

	const changed = new Set<number>()
	for (const text of calls) {
		const index = lookup.get(text)
		if (index !== undefined) {
			changed.add(index)
		}
	}

	return Array.from(changed).sort((a, b) => a - b)
}

const createHarness = (initialFile: FileState): HarnessHandle => {
	const [filePath, setFilePath] = createSignal(initialFile.path)
	const [content, setContent] = createSignal(initialFile.content)
	const [pieceTable, setPieceTable] = createSignal<
		PieceTableSnapshot | undefined
	>(createPieceTableSnapshot(initialFile.content))
	const [highlightOffsets, setHighlightOffsets] = createSignal<
		HighlightOffsets | undefined
	>(undefined)
	const [highlights, setHighlights] = createSignal(initialFile.highlights)
	const [isFileSelected] = createSignal(true)
	const [fontSize] = createSignal(14)
	const [fontFamily] = createSignal('monospace')
	const [cursorMode] = createSignal<CursorMode>(CursorMode.Regular)
	const [stats] = createSignal(undefined)

	const document: TextEditorDocument = {
		filePath,
		content,
		pieceTable,
		updatePieceTable: (updater) => {
			setPieceTable(updater(pieceTable()))
		},
		isEditable: () => true,
		applyIncrementalEdit: (edit) => {
			setContent((prev) => {
				const before = prev.slice(0, edit.startIndex)
				const after = prev.slice(edit.oldEndIndex)
				return before + edit.insertedText + after
			})

			const offset = {
				charDelta: getEditCharDelta(edit),
				lineDelta: getEditLineDelta(edit),
				fromCharIndex: edit.startIndex,
				fromLineRow: edit.startPosition.row,
				oldEndRow: edit.oldEndPosition.row,
				newEndRow: edit.newEndPosition.row,
				oldEndIndex: edit.oldEndIndex,
				newEndIndex: edit.newEndIndex,
			}

			setPieceTable((prev) => {
				if (!prev) return prev
				const deletedLength = edit.oldEndIndex - edit.startIndex
				const withDeletion =
					deletedLength > 0
						? deleteFromPieceTable(prev, edit.startIndex, deletedLength)
						: prev

				return insertIntoPieceTable(
					withDeletion,
					edit.startIndex,
					edit.insertedText
				)
			})

			setHighlightOffsets((prev) => (prev ? [...prev, offset] : [offset]))
		},
	}

	const screen = render(() => (
		<ColorModeProvider>
			<ThemeProvider>
				<div
					style={{
						width: '900px',
						height: '600px',
						position: 'relative',
						display: 'flex',
						'flex-direction': 'column',
					}}
				>
					<Editor
						document={document}
						isFileSelected={isFileSelected}
						stats={stats}
						fontSize={fontSize}
						fontFamily={fontFamily}
						cursorMode={cursorMode}
						highlights={highlights}
						highlightOffset={highlightOffsets}
					/>
				</div>
			</ThemeProvider>
		</ColorModeProvider>
	))

	const switchFile = (next: FileState) => {
		batch(() => {
			setFilePath(next.path)
			setContent(next.content)
			setPieceTable(createPieceTableSnapshot(next.content))
			setHighlights(next.highlights)
			setHighlightOffsets(undefined)
		})
	}

	const typeAt = (lineIndex: number, column: number, text: string) => {
		const line = screen.container.querySelector(
			`.editor-line[data-index="${lineIndex}"]`
		) as HTMLDivElement | null
		if (!line) {
			throw new Error(`line ${lineIndex} not found`)
		}

		const rect = line.getBoundingClientRect()
		line.dispatchEvent(
			new MouseEvent('mousedown', {
				button: 0,
				clientX: rect.left + Math.max(1, column * 8),
				clientY: rect.top + 2,
				bubbles: true,
			})
		)

		const input = screen.container.querySelector(
			'textarea'
		) as HTMLTextAreaElement | null
		if (!input) {
			throw new Error('input not found')
		}

		input.value = text
		input.dispatchEvent(
			new InputEvent('input', {
				data: text,
				inputType: 'insertText',
				bubbles: true,
			})
		)
	}

	return {
		switchFile,
		typeAt,
		setHighlights,
		container: screen.container as HTMLDivElement,
		getContent: content,
		unmount: () => screen.unmount(),
	}
}

describe('LineRow highlight offsets', () => {
	let activeHarness: HarnessHandle | null = null

	afterAll(async () => {
		await disposeTreeSitterWorker()
	})

	afterEach(() => {
		activeHarness?.unmount()
		activeHarness = null
		buildTextRunsCalls.length = 0
	})

	// This test verifies minimal recomputation when offsets are applied.
	it('only recomputes text runs for the edited line after file switch', async () => {
		const fileAContent = jsContent
		const fileBContent = jsContent
		const fileAHighlights = await getTreeSitterHighlights(
			'fileA.js',
			fileAContent
		)
		const fileBHighlights = await getTreeSitterHighlights(
			'fileB.js',
			fileBContent
		)
		const fileA: FileState = {
			path: 'fileA.js',
			content: fileAContent,
			highlights: fileAHighlights,
		}
		const fileB: FileState = {
			path: 'fileB.js',
			content: fileBContent,
			highlights: fileBHighlights,
		}

		activeHarness = createHarness(fileA)

		const expectedLines = fileAContent.split('\n').length
		await expect
			.poll(
				() => activeHarness!.container.querySelectorAll('.editor-line').length
			)
			.toBe(expectedLines)

		activeHarness.switchFile(fileB)
		const expectedLinesB = fileBContent.split('\n').length
		await expect
			.poll(
				() => activeHarness!.container.querySelectorAll('.editor-line').length
			)
			.toBe(expectedLinesB)

		await waitForFrames(2)
		buildTextRunsCalls.length = 0

		activeHarness.typeAt(0, 0, 'x')

		await expect.poll(() => buildTextRunsCalls.length).toBeGreaterThan(0)

		await waitForFrames(2)

		const changedLines = collectBuildTextRunsLines(
			buildTextRunsCalls,
			activeHarness.getContent()
		)

		expect(changedLines).toEqual([0])
	})

	// Repro: first edit replaces most line nodes.
	it('keeps line DOM nodes stable on first edit', async () => {
		const sqliteHighlightsPromise = getTreeSitterHighlights(
			'sqlite.js',
			sqliteContent
		)
		const fileA: FileState = {
			path: 'sqlite.js',
			content: sqliteContent,
			highlights: undefined,
		}

		activeHarness = createHarness(fileA)

		await expect
			.poll(
				() => activeHarness!.container.querySelectorAll('.editor-line').length
			)
			.toBeGreaterThan(0)

		const sqliteHighlights = await sqliteHighlightsPromise
		activeHarness.setHighlights(sqliteHighlights)
		await waitForFrames(2)
		const beforeNodes = Array.from(
			activeHarness.container.querySelectorAll('.editor-line')
		)
		activeHarness.typeAt(0, 0, 'x')

		// Wait for content change to verify the edit was applied
		await expect.poll(() => activeHarness!.getContent()).toContain('x')
		await waitForFrames(2)

		const afterNodes = Array.from(
			activeHarness.container.querySelectorAll('.editor-line')
		)
		const reused = beforeNodes.filter(
			(node, index) => afterNodes[index] === node
		).length
		expect(reused).toBeGreaterThanOrEqual(50)
	})
})
