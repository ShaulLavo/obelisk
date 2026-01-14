import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { GrepCoordinator } from '../GrepCoordinator'
import type { GrepFileResult, GrepProgress } from '../types'
import { getMemoryRoot } from '../../getRoot'
import { createRootCtx } from '../../file'
import { workerApi } from '../grepWorker'

// Mock Worker class since we're in Node/Vitest environment
class MockWorker {
	postMessage() {}
	terminate() {}
	addEventListener() {}
	removeEventListener() {}
	dispatchEvent() {
		return true
	}
	onmessage = null
	onmessageerror = null
	onerror = null
}

globalThis.Worker = MockWorker as unknown as typeof Worker

// Mock Comlink to bypass worker messaging and call implementation directly
vi.mock('comlink', () => ({
	expose: () => {},
	wrap: () => workerApi,
}))

describe('Grep Integration', () => {
	let fs: ReturnType<typeof createRootCtx>
	let coordinator: GrepCoordinator

	beforeEach(async () => {
		// Setup Memory File System
		const root = await getMemoryRoot()
		fs = createRootCtx(root)

		// Create files
		await fs.write('file1.txt', 'hello world\nline 2')
		await fs.write('src/code.ts', "console.log('hello')")
		await fs.write('src/utils.ts', 'function test() { return true }')
		await fs.write('.hidden', 'secret hello')
		await fs.write('src/.git/config', 'repository info')
		await fs.write('large.txt', 'x'.repeat(1000) + 'hello' + 'x'.repeat(1000))

		coordinator = new GrepCoordinator(fs)
	})

	afterEach(() => {
		coordinator.terminate()
	})

	it('finds pattern in multiple files', async () => {
		const matches = await coordinator.grep({
			pattern: 'hello',
		})

		// Should find matches in file1.txt, src/code.ts, and large.txt
		// .hidden should be skipped by default
		expect(matches.length).toBe(3)

		const paths = matches.map((m) => m.path).sort()
		expect(paths).toEqual(['file1.txt', 'large.txt', 'src/code.ts'])
	})

	it('finds exact match content', async () => {
		const matches = await coordinator.grep({
			pattern: "console.log('hello')",
		})

		expect(matches.length).toBe(1)
		expect(matches[0]?.path).toBe('src/code.ts')
		expect(matches[0]?.lineContent).toBe("console.log('hello')")
		expect(matches[0]?.lineNumber).toBe(1)
	})

	it('respects paths filter', async () => {
		const matches = await coordinator.grep({
			pattern: 'hello',
			paths: ['src'],
		})

		// Should only find src/code.ts
		expect(matches.length).toBe(1)
		expect(matches[0]?.path).toBe('src/code.ts')
	})

	it('includes hidden files when requested', async () => {
		const matches = await coordinator.grep({
			pattern: 'hello',
			includeHidden: true,
		})

		// Should include .hidden file (but NOT .git/config because .git is a hidden dir?)
		// Our implementation skips hidden dirs by default too.
		// Let's check if .hidden is found.
		const hiddenMatch = matches.find((m) => m.path === '.hidden')
		expect(hiddenMatch).toBeDefined()
	})

	it('streams results via searchStream', async () => {
		const results: GrepFileResult[] = []
		for await (const result of coordinator.grepStream({ pattern: 'hello' })) {
			results.push(result)
		}

		expect(results.length).toBeGreaterThan(0)
		const paths = results.map((r) => r.path).sort()
		expect(paths).toContain('file1.txt')
		expect(paths).toContain('src/code.ts')
	})

	it('reports progress', async () => {
		const progressUpdates: GrepProgress[] = []
		await coordinator.grep({ pattern: 'hello' }, (progress: GrepProgress) =>
			progressUpdates.push(progress)
		)

		expect(progressUpdates.length).toBeGreaterThan(0)
		const lastUpdate = progressUpdates[progressUpdates.length - 1]!
		expect(lastUpdate.filesScanned).toBeGreaterThan(0)
		expect(lastUpdate.matchesFound).toBe(3)
	})

	it('finds match in large file correctly', async () => {
		// Create a file larger than default chunk size (512KB)
		const size = 600 * 1024
		const largeContent = 'A'.repeat(size) // 600KB of 'A'

		// Insert pattern spanning standard chunk boundary
		// We need to write this carefully to MemoryFS
		// fs.write accepts string or BufferSource.
		// MemoryHandle defaults to accepting strings/buffers.

		await fs.write('huge.txt', largeContent + 'PATTERN' + largeContent)

		const matches = await coordinator.grep({
			pattern: 'PATTERN',
			chunkSize: 100 * 1024, // Force smaller chunks to ensure multiple chunks
		})

		expect(matches.length).toBe(1)
		expect(matches[0]?.path).toBe('huge.txt')
	})

	it('supports case-insensitive search', async () => {
		await fs.write('case.txt', 'Hello World\nhello world\nHELLO WORLD')

		const matches = await coordinator.grep({
			pattern: 'hello',
			caseInsensitive: true,
		})

		expect(matches.length).toBe(3)
		expect(matches[0]?.lineContent).toBe('Hello World')
		expect(matches[1]?.lineContent).toBe('hello world')
		expect(matches[2]?.lineContent).toBe('HELLO WORLD')
	})

	it('supports smart-case search', async () => {
		await fs.write('smart.txt', 'foo\nFoo\nFOO')

		// Lowercase pattern -> case insensitive
		const matches1 = await coordinator.grep({
			pattern: 'foo',
			smartCase: true,
		})
		expect(matches1.length).toBe(3)

		// Uppercase pattern -> case sensitive
		const matches2 = await coordinator.grep({
			pattern: 'Foo',
			smartCase: true,
		})
		expect(matches2.length).toBe(1)
		expect(matches2[0]?.lineContent).toBe('Foo')
	})

	it('supports word boundary search', async () => {
		await fs.write('word.txt', 'word\nsubword\nword_suffix\nprefix_word')

		const matches = await coordinator.grep({
			pattern: 'word',
			wordRegexp: true,
		})

		expect(matches.length).toBe(1)
		expect(matches[0]?.lineContent).toBe('word')
	})

	it('supports invert match', async () => {
		await fs.write('invert.txt', 'line 1\nmatch this\nline 3')

		const matches = await coordinator.grep({
			pattern: 'match',
			invertMatch: true,
		})

		expect(matches.length).toBe(2)
		expect(matches[0]?.lineContent).toBe('line 1')
		expect(matches[1]?.lineContent).toBe('line 3')
	})

	it('supports count mode', async () => {
		await fs.write('count1.txt', 'foo\nfoo')
		await fs.write('count2.txt', 'foo')

		const results: GrepFileResult[] = []
		for await (const result of coordinator.grepStream({
			pattern: 'foo',
			count: true,
		})) {
			results.push(result)
		}

		expect(results.length).toBe(2)
		const count1 = results.find((r) => r.path === 'count1.txt')
		const count2 = results.find((r) => r.path === 'count2.txt')

		expect(count1?.matchCount).toBe(2)
		expect(count2?.matchCount).toBe(1)
	})

	it('supports files-with-matches', async () => {
		await fs.write('yes.txt', 'found')
		await fs.write('no.txt', 'missing')

		const matches = await coordinator.grep({
			pattern: 'found',
			filesWithMatches: true,
		})

		expect(matches.length).toBe(1)
		expect(matches[0]?.path).toBe('yes.txt')
		// Content should be empty or ignored
		expect(matches[0]?.lineContent).toBe('')
	})

	it('supports context lines', async () => {
		await fs.write('context.txt', 'line 1\nline 2\nmatch\nline 4\nline 5')

		const matches = await coordinator.grep({
			pattern: 'match',
			context: 1,
		})

		expect(matches.length).toBe(1)
		const m = matches[0]!
		expect(m.lineContent).toBe('match')
		expect(m.context).toBeDefined()
		expect(m.context?.before.length).toBe(1)
		expect(m.context?.before[0]?.content).toBe('line 2')
		expect(m.context?.after.length).toBe(1)
		expect(m.context?.after[0]?.content).toBe('line 4')
	})
})
