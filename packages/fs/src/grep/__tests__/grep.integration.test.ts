/**
 * Grep Integration Tests
 *
 * Tests the full grep flow using:
 * - Memory File System (simulating OPFS)
 * - Mocked Web Worker (using direct logic execution)
 * - GrepCoordinator
 *
 * TODO: Add true E2E integration test using Vitest Browser Mode to verify:
 * - Real Worker instantiation and message passing (serialization checks)
 * - Terminal + Grep integration in a real browser environment
 * - True parallel execution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GrepCoordinator } from '../GrepCoordinator'
import { getMemoryRoot } from '../../getRoot'
import { createFs } from '../../vfs'
import { workerApi } from '../grepWorker'

// Mock Worker class since we're in Node/Vitest environment
class MockWorker {
	postMessage() {}
	terminate() {}
	addEventListener() {}
	removeEventListener() {}
}

globalThis.Worker = MockWorker as any

// Mock Comlink to bypass worker messaging and call implementation directly
vi.mock('comlink', () => ({
	expose: () => {},
	wrap: () => workerApi,
}))

describe('Grep Integration', () => {
	let fs: ReturnType<typeof createFs>
	let coordinator: GrepCoordinator

	beforeEach(async () => {
		// Setup Memory File System
		const root = await getMemoryRoot()
		fs = createFs(root)

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
		const results: any[] = []
		for await (const result of coordinator.grepStream({ pattern: 'hello' })) {
			results.push(result)
		}

		expect(results.length).toBeGreaterThan(0)
		const paths = results.map((r) => r.path).sort()
		expect(paths).toContain('file1.txt')
		expect(paths).toContain('src/code.ts')
	})

	it('reports progress', async () => {
		const progressUpdates: any[] = []
		await coordinator.grep({ pattern: 'hello' }, (progress) =>
			progressUpdates.push(progress)
		)

		expect(progressUpdates.length).toBeGreaterThan(0)
		const lastUpdate = progressUpdates[progressUpdates.length - 1]
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
})
