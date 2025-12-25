// Typing performance benchmark tests
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
	createTestEditor,
	waitForEditorReady,
	typeString,
	typeFast,
	typeNewlines,
	typeBackspace,
	collectMetrics,
	summarizeMetrics,
	formatMetricsSummary,
	waitForFrames,
	type TestEditorHandle,
} from './utils'
import { generateContent, BENCHMARK_PRESETS } from './generateContent'
import highlightHeavyData from './data/highlight-heavy.json'
import bracketHeavyData from './data/bracket-heavy.json'

describe('Typing Performance Benchmarks', () => {
	let editor: TestEditorHandle | null = null
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		// Spy on console.error to catch unexpected errors
		consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation((...args) => {
				// Throw on any console.error calls during tests
				throw new Error(`Unexpected console.error: ${JSON.stringify(args)}`)
			})
	})

	afterEach(() => {
		if (editor) {
			editor.unmount()
			editor = null
		}
		// Restore console.error
		consoleErrorSpy?.mockRestore()
	})

	describe('Heavy Highlights', () => {
		it('measures keystroke latency with dense syntax highlighting', async () => {
			editor = createTestEditor({
				content: highlightHeavyData.content,
				filePath: 'benchmark.ts',
				highlights: highlightHeavyData.highlights,
			})

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const testText = 'const x = 1;'
			const metrics = await collectMetrics(async () => {
				return typeString(input!, testText, { delay: 0, waitForRender: true })
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Heavy Highlights Typing', summary))

			expect(summary.median).toBeLessThan(100)
			expect(summary.p95).toBeLessThan(200)
		})

		it('measures latency with 500+ visible highlights', async () => {
			const content = generateContent({ lines: 100, charsPerLine: 80 })

			const highlights = []
			for (let i = 0; i < content.length - 5; i += 5) {
				highlights.push({
					startIndex: i,
					endIndex: i + 4,
					scope: i % 3 === 0 ? 'keyword' : i % 3 === 1 ? 'string' : 'variable',
				})
			}

			editor = createTestEditor({
				content,
				filePath: 'dense.ts',
				highlights: highlights.slice(0, 600),
			})

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, 'abc', { delay: 0, waitForRender: true })
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Dense Highlights (600+)', summary))

			expect(summary.median).toBeLessThan(150)
		})
	})

	describe('Bracket Typing', () => {
		it('measures performance typing opening brackets', async () => {
			editor = createTestEditor({
				content: bracketHeavyData.content,
				filePath: 'brackets.ts',
				brackets: bracketHeavyData.brackets,
			})

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const bracketString = '{{{{[[[[(((())))]]]]}}}}'
			const metrics = await collectMetrics(async () => {
				return typeString(input!, bracketString, {
					delay: 0,
					waitForRender: true,
				})
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Bracket Typing', summary))

			expect(summary.median).toBeLessThan(100)
		})

		it('measures performance with deep bracket nesting', async () => {
			const nestedContent =
				Array.from({ length: 20 }, (_, i) => '\t'.repeat(i) + '{').join('\n') +
				'\n' +
				Array.from({ length: 20 }, (_, i) => '\t'.repeat(19 - i) + '}').join(
					'\n'
				)

			editor = createTestEditor({
				content: nestedContent,
				filePath: 'deep-nesting.ts',
			})

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, 'x = 1', { delay: 0, waitForRender: true })
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Deep Nesting Typing', summary))

			expect(summary.median).toBeLessThan(100)
		})
	})

	describe('Large Files', () => {
		it('measures typing at start of 10k line file', async () => {
			const content = generateContent(BENCHMARK_PRESETS.normal)

			editor = createTestEditor({ content, filePath: 'large.ts', height: 800 })

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, 'const x = 1;', {
					delay: 0,
					waitForRender: true,
				})
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Large File - Start', summary))

			expect(summary.median).toBeLessThan(100)
		})

		it('measures typing with virtualization active', async () => {
			const content = generateContent(BENCHMARK_PRESETS.normal)

			editor = createTestEditor({
				content,
				filePath: 'large-scroll.ts',
				height: 600,
			})

			await waitForEditorReady(editor)

			const scrollEl = editor.getScrollElement()
			if (scrollEl) {
				scrollEl.scrollTop = scrollEl.scrollHeight / 2
				await waitForFrames(3)
			}

			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, 'middle', { delay: 0, waitForRender: true })
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(
				formatMetricsSummary('Large File - Middle (Virtualized)', summary)
			)

			expect(summary.median).toBeLessThan(100)
		})
	})

	describe('Typing Patterns', () => {
		it('benchmarks fast burst typing', async () => {
			editor = createTestEditor({
				content: 'function test() {\n\treturn\n}',
				filePath: 'burst.ts',
			})

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const start = performance.now()
			const latencies = await typeFast(input!, 'abcdefghijklmnopqrstuvwxyz')
			const totalTime = performance.now() - start

			console.log(`Fast Typing: 26 chars in ${totalTime.toFixed(2)}ms`)
			console.log(`Average: ${(totalTime / 26).toFixed(2)}ms per char`)

			expect(latencies.length).toBe(26)
		})

		it('benchmarks newline insertion', async () => {
			const content = generateContent({ lines: 50, charsPerLine: 60 })

			editor = createTestEditor({ content, filePath: 'newlines.ts' })

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeNewlines(input!, 10, { delay: 0, waitForRender: true })
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Newline Insertion', summary))

			expect(summary.median).toBeLessThan(150)
		})

		it('benchmarks character deletion', async () => {
			editor = createTestEditor({
				content: 'const x = 1234567890;',
				filePath: 'delete.ts',
			})

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeBackspace(input!, 10, { delay: 0, waitForRender: true })
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('Backspace Deletion', summary))

			expect(summary.median).toBeLessThan(100)
		})
	})

	describe('Grammar Variants', () => {
		it('benchmarks TypeScript with generics', async () => {
			const content = `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

function map<T, U>(result: Result<T, unknown>, fn: (value: T) => U): Result<U, unknown> {
	if (result.ok) {
		return { ok: true, value: fn(result.value) }
	}
	return result
}`

			editor = createTestEditor({ content, filePath: 'generics.ts' })

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, '<T extends object>', {
					delay: 0,
					waitForRender: true,
				})
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('TypeScript Generics', summary))

			expect(summary.median).toBeLessThan(100)
		})

		it('benchmarks JSON editing', async () => {
			const content = JSON.stringify(
				{
					users: Array.from({ length: 20 }, (_, i) => ({
						id: i,
						name: `User ${i}`,
						email: `user${i}@example.com`,
					})),
				},
				null,
				2
			)

			editor = createTestEditor({ content, filePath: 'data.json' })

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, '"newKey": "newValue",', {
					delay: 0,
					waitForRender: true,
				})
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('JSON Editing', summary))

			expect(summary.median).toBeLessThan(100)
		})

		it('benchmarks HTML editing', async () => {
			const content = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
	<div class="container">
		<header><nav><ul>
			<li><a href="/">Home</a></li>
			<li><a href="/about">About</a></li>
		</ul></nav></header>
	</div>
</body>
</html>`

			editor = createTestEditor({ content, filePath: 'page.html' })

			await waitForEditorReady(editor)
			editor.focus()

			const input = editor.getInputElement()
			expect(input).toBeTruthy()

			const metrics = await collectMetrics(async () => {
				return typeString(input!, '<div id="new">', {
					delay: 0,
					waitForRender: true,
				})
			})

			const summary = summarizeMetrics(metrics.keystrokeLatencies)
			console.log(formatMetricsSummary('HTML Editing', summary))

			expect(summary.median).toBeLessThan(100)
		})
	})
})
