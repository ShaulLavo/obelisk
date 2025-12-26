/**
 * VFS Path/Tree Walking Benchmark Worker
 *
 * Measures the performance impact of:
 * 1. Path resolution overhead
 * 2. Directory handle tree walking
 * 3. File handle acquisition at various depths
 * 4. Sequential vs batch operations
 * 5. Cache effectiveness
 *
 * Run this benchmark before and after optimizations to measure impact.
 */

import { expose } from 'comlink'
import { createFs, getRootDirectory, type FsContext } from '@repo/fs'
import type {
	VfsPathScenario,
	VfsPathResult,
	VfsPathBenchPayload,
} from './vfsPathBench.types'

// ============================================================================
// Configuration
// ============================================================================

const BENCH_ROOT = 'vfs-path-bench-v1'
const WARMUP_ITERATIONS = 3
const DEFAULT_ITERATIONS = 10
const DEFAULT_FILE_SIZE = 1024 // 1KB

// ============================================================================
// Scenarios
// ============================================================================

const scenarios: VfsPathScenario[] = [
	// --- Path Resolution (no I/O) ---
	{
		name: 'resolve-shallow',
		category: 'path-resolution',
		description: 'Resolve 1000 paths at depth 1',
		depth: 1,
		fileCount: 1000,
		iterations: 5,
	},
	{
		name: 'resolve-medium',
		category: 'path-resolution',
		description: 'Resolve 1000 paths at depth 5',
		depth: 5,
		fileCount: 1000,
		iterations: 5,
	},
	{
		name: 'resolve-deep',
		category: 'path-resolution',
		description: 'Resolve 1000 paths at depth 10',
		depth: 10,
		fileCount: 1000,
		iterations: 5,
	},

	// --- Handle Acquisition (actual I/O) ---
	{
		name: 'handle-depth-1',
		category: 'handle-acquisition',
		description: 'Get file handles at depth 1 (50 files)',
		depth: 1,
		fileCount: 50,
		iterations: 3,
	},
	{
		name: 'handle-depth-3',
		category: 'handle-acquisition',
		description: 'Get file handles at depth 3 (50 files)',
		depth: 3,
		fileCount: 50,
		iterations: 3,
	},
	{
		name: 'handle-depth-5',
		category: 'handle-acquisition',
		description: 'Get file handles at depth 5 (50 files)',
		depth: 5,
		fileCount: 50,
		iterations: 3,
	},
	{
		name: 'handle-depth-8',
		category: 'handle-acquisition',
		description: 'Get file handles at depth 8 (50 files)',
		depth: 8,
		fileCount: 50,
		iterations: 3,
	},

	// --- File Read Operations ---
	{
		name: 'read-sequential-shallow',
		category: 'file-read',
		description: 'Read 100 files sequentially at depth 2',
		depth: 2,
		fileCount: 100,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		parallel: false,
		iterations: 3,
	},
	{
		name: 'read-sequential-deep',
		category: 'file-read',
		description: 'Read 100 files sequentially at depth 6',
		depth: 6,
		fileCount: 100,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		parallel: false,
		iterations: 3,
	},
	{
		name: 'read-parallel-shallow',
		category: 'file-read',
		description: 'Read 100 files in parallel at depth 2',
		depth: 2,
		fileCount: 100,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		parallel: true,
		iterations: 3,
	},
	{
		name: 'read-parallel-deep',
		category: 'file-read',
		description: 'Read 100 files in parallel at depth 6',
		depth: 6,
		fileCount: 100,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		parallel: true,
		iterations: 3,
	},

	// --- Batch Operations (future optimization target) ---
	{
		name: 'batch-same-dir',
		category: 'batch-operations',
		description: 'Read 50 files from same directory',
		depth: 3,
		fileCount: 50,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		iterations: 5,
	},
	{
		name: 'batch-sibling-dirs',
		category: 'batch-operations',
		description: 'Read 50 files from sibling directories (shared parent)',
		depth: 4,
		fileCount: 50,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		iterations: 5,
	},
	{
		name: 'batch-scattered',
		category: 'batch-operations',
		description: 'Read 50 files scattered across different paths',
		depth: 5,
		fileCount: 50,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		iterations: 5,
	},

	// --- Cache Effectiveness ---
	{
		name: 'cache-same-file',
		category: 'cache-effectiveness',
		description: 'Read same file 100 times (tests #fileSnapshot cache)',
		depth: 4,
		fileCount: 1,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		iterations: 100,
	},
	{
		name: 'cache-same-dir-files',
		category: 'cache-effectiveness',
		description: 'Read 10 files from same dir, 10 times each',
		depth: 3,
		fileCount: 10,
		fileSizeBytes: DEFAULT_FILE_SIZE,
		iterations: 10,
	},
]

// ============================================================================
// Utilities
// ============================================================================

const supportsOpfs = () =>
	typeof navigator !== 'undefined' &&
	Boolean(navigator.storage) &&
	typeof navigator.storage.getDirectory === 'function'

const measure = async <T>(
	fn: () => Promise<T>
): Promise<{ result: T; ms: number }> => {
	const start = performance.now()
	const result = await fn()
	return { result, ms: performance.now() - start }
}

const measureSync = <T>(fn: () => T): { result: T; ms: number } => {
	const start = performance.now()
	const result = fn()
	return { result, ms: performance.now() - start }
}

const generatePath = (depth: number, index: number): string => {
	const segments: string[] = []
	for (let d = 0; d < depth - 1; d++) {
		segments.push(`dir${d}_${index % (d + 2)}`) // Creates some path sharing
	}
	segments.push(`file_${index}.txt`)
	return segments.join('/')
}

const generateScatteredPath = (depth: number, index: number): string => {
	const segments: string[] = []
	for (let d = 0; d < depth - 1; d++) {
		segments.push(`scattered_${d}_${index}`) // No path sharing
	}
	segments.push(`file_${index}.txt`)
	return segments.join('/')
}

const generateSameDirPath = (dirDepth: number, index: number): string => {
	const segments: string[] = []
	for (let d = 0; d < dirDepth; d++) {
		segments.push(`shared_dir_${d}`)
	}
	segments.push(`file_${index}.txt`)
	return segments.join('/')
}

const generateSiblingDirPath = (parentDepth: number, index: number): string => {
	const segments: string[] = []
	for (let d = 0; d < parentDepth - 1; d++) {
		segments.push(`parent_${d}`)
	}
	segments.push(`sibling_${index % 5}`) // 5 sibling directories
	segments.push(`file_${index}.txt`)
	return segments.join('/')
}

const generateContent = (sizeBytes: number, index: number): string => {
	const prefix = `FILE_${index}_`
	const padding = 'x'.repeat(Math.max(0, sizeBytes - prefix.length))
	return prefix + padding
}

const percentile = (arr: number[], p: number): number => {
	const sorted = [...arr].sort((a, b) => a - b)
	const idx = Math.ceil((p / 100) * sorted.length) - 1
	return sorted[Math.max(0, idx)]!
}

const average = (arr: number[]): number =>
	arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length

// ============================================================================
// Benchmark Runners
// ============================================================================

type BenchContext = {
	fs: FsContext
	rootHandle: FileSystemDirectoryHandle
}

const setupBenchFiles = async (
	ctx: BenchContext,
	paths: string[],
	sizeBytes: number
): Promise<void> => {
	for (let i = 0; i < paths.length; i++) {
		const file = ctx.fs.file(paths[i]!, 'rw')
		await file.write(generateContent(sizeBytes, i))
	}
}

const cleanupBench = async (ctx: BenchContext): Promise<void> => {
	const root = ctx.fs.dir()
	try {
		await root.remove({ recursive: true, force: true })
	} catch {
		// Ignore cleanup errors
	}
}

// --- Path Resolution Benchmark ---
const runPathResolutionBench = async (
	ctx: BenchContext,
	scenario: VfsPathScenario
): Promise<VfsPathResult> => {
	const depth = scenario.depth ?? 5
	const count = scenario.fileCount ?? 1000
	const iterations = scenario.iterations ?? DEFAULT_ITERATIONS

	const paths = Array.from({ length: count }, (_, i) => generatePath(depth, i))
	const timings: number[] = []

	// Warmup
	for (let w = 0; w < WARMUP_ITERATIONS; w++) {
		for (const path of paths) {
			ctx.fs.file(path)
		}
	}

	// Actual benchmark
	for (let iter = 0; iter < iterations; iter++) {
		const { ms } = measureSync(() => {
			for (const path of paths) {
				ctx.fs.file(path)
			}
		})
		timings.push(ms)
	}

	const totalMs = timings.reduce((a, b) => a + b, 0)
	const avgMs = average(timings)
	const totalOps = count * iterations

	return {
		scenario: scenario.name,
		adapter: 'optimized',
		avgMs: avgMs / count,
		totalMs,
		opsPerSec: (totalOps / totalMs) * 1000,
		timings,
		p50Ms: percentile(timings, 50) / count,
		p95Ms: percentile(timings, 95) / count,
		p99Ms: percentile(timings, 99) / count,
	}
}

// --- Handle Acquisition Benchmark ---
const runHandleAcquisitionBench = async (
	ctx: BenchContext,
	scenario: VfsPathScenario
): Promise<VfsPathResult> => {
	const depth = scenario.depth ?? 5
	const count = scenario.fileCount ?? 50
	const iterations = scenario.iterations ?? 3
	const sizeBytes = scenario.fileSizeBytes ?? DEFAULT_FILE_SIZE

	const paths = Array.from({ length: count }, (_, i) => generatePath(depth, i))

	await setupBenchFiles(ctx, paths, sizeBytes)

	const timings: number[] = []

	// Warmup
	for (let w = 0; w < WARMUP_ITERATIONS; w++) {
		for (const path of paths) {
			const file = ctx.fs.file(path)
			await file.exists()
		}
	}

	// Actual benchmark
	for (let iter = 0; iter < iterations; iter++) {
		const iterTimings: number[] = []
		for (const path of paths) {
			const file = ctx.fs.file(path)
			const { ms } = await measure(() => file.exists())
			iterTimings.push(ms)
		}
		timings.push(...iterTimings)
	}

	const totalMs = timings.reduce((a, b) => a + b, 0)
	const avgMs = average(timings)
	const totalOps = count * iterations

	return {
		scenario: scenario.name,
		adapter: 'optimized',
		avgMs,
		totalMs,
		opsPerSec: (totalOps / totalMs) * 1000,
		timings,
		p50Ms: percentile(timings, 50),
		p95Ms: percentile(timings, 95),
		p99Ms: percentile(timings, 99),
	}
}

// --- File Read Benchmark ---
const runFileReadBench = async (
	ctx: BenchContext,
	scenario: VfsPathScenario
): Promise<VfsPathResult> => {
	const depth = scenario.depth ?? 3
	const count = scenario.fileCount ?? 100
	const iterations = scenario.iterations ?? 3
	const sizeBytes = scenario.fileSizeBytes ?? DEFAULT_FILE_SIZE
	const parallel = scenario.parallel ?? false

	const paths = Array.from({ length: count }, (_, i) => generatePath(depth, i))

	await setupBenchFiles(ctx, paths, sizeBytes)

	const timings: number[] = []

	// Warmup
	for (let w = 0; w < Math.min(WARMUP_ITERATIONS, 2); w++) {
		if (parallel) {
			await Promise.all(paths.map((p) => ctx.fs.file(p).text()))
		} else {
			for (const p of paths) {
				await ctx.fs.file(p).text()
			}
		}
	}

	// Actual benchmark
	for (let iter = 0; iter < iterations; iter++) {
		if (parallel) {
			const { ms } = await measure(async () => {
				await Promise.all(paths.map((p) => ctx.fs.file(p).text()))
			})
			timings.push(ms / count)
		} else {
			for (const path of paths) {
				const { ms } = await measure(() => ctx.fs.file(path).text())
				timings.push(ms)
			}
		}
	}

	const totalMs = timings.reduce((a, b) => a + b, 0)
	const avgMs = average(timings)
	const totalOps = parallel ? count * iterations : count * iterations

	return {
		scenario: scenario.name,
		adapter: 'optimized',
		avgMs,
		totalMs,
		opsPerSec: (totalOps / totalMs) * 1000,
		timings,
		p50Ms: percentile(timings, 50),
		p95Ms: percentile(timings, 95),
		p99Ms: percentile(timings, 99),
	}
}

// --- Batch Operations Benchmark ---
const runBatchOperationsBench = async (
	ctx: BenchContext,
	scenario: VfsPathScenario
): Promise<VfsPathResult> => {
	const depth = scenario.depth ?? 3
	const count = scenario.fileCount ?? 50
	const iterations = scenario.iterations ?? 5
	const sizeBytes = scenario.fileSizeBytes ?? DEFAULT_FILE_SIZE

	let paths: string[]
	if (scenario.name.includes('same-dir')) {
		paths = Array.from({ length: count }, (_, i) =>
			generateSameDirPath(depth - 1, i)
		)
	} else if (scenario.name.includes('sibling')) {
		paths = Array.from({ length: count }, (_, i) =>
			generateSiblingDirPath(depth, i)
		)
	} else {
		paths = Array.from({ length: count }, (_, i) =>
			generateScatteredPath(depth, i)
		)
	}

	await setupBenchFiles(ctx, paths, sizeBytes)

	const timings: number[] = []

	// Warmup
	for (let w = 0; w < WARMUP_ITERATIONS; w++) {
		await ctx.fs.readTextFiles(paths)
	}

	// Benchmark
	for (let iter = 0; iter < iterations; iter++) {
		const { ms } = await measure(async () => {
			await ctx.fs.readTextFiles(paths)
		})
		timings.push(ms)
	}

	const totalMs = timings.reduce((a, b) => a + b, 0)
	const avgMs = average(timings)

	return {
		scenario: scenario.name,
		adapter: 'optimized',
		avgMs: avgMs / count,
		totalMs,
		opsPerSec: ((count * iterations) / totalMs) * 1000,
		timings,
		p50Ms: percentile(timings, 50) / count,
		p95Ms: percentile(timings, 95) / count,
		p99Ms: percentile(timings, 99) / count,
	}
}

// --- Cache Effectiveness Benchmark ---
const runCacheEffectivenessBench = async (
	ctx: BenchContext,
	scenario: VfsPathScenario
): Promise<VfsPathResult> => {
	const depth = scenario.depth ?? 4
	const count = scenario.fileCount ?? 1
	const iterations = scenario.iterations ?? 100
	const sizeBytes = scenario.fileSizeBytes ?? DEFAULT_FILE_SIZE

	const paths = Array.from({ length: count }, (_, i) => generatePath(depth, i))

	await setupBenchFiles(ctx, paths, sizeBytes)

	const timings: number[] = []
	const coldTimings: number[] = []
	const warmTimings: number[] = []

	for (const path of paths) {
		// Cold read
		const { ms: coldMs } = await measure(() => ctx.fs.file(path).text())
		coldTimings.push(coldMs)

		// Warm reads (reuse VFile instance)
		const file = ctx.fs.file(path)
		await file.text() // Prime cache

		for (let i = 0; i < iterations - 1; i++) {
			const { ms: warmMs } = await measure(() => file.text())
			warmTimings.push(warmMs)
		}
	}

	timings.push(...coldTimings, ...warmTimings)

	const avgCold = average(coldTimings)
	const avgWarm = average(warmTimings)
	const cacheSpeedup = avgCold / avgWarm

	console.log(
		`[${scenario.name}] Cold: ${avgCold.toFixed(2)}ms, Warm: ${avgWarm.toFixed(2)}ms, Speedup: ${cacheSpeedup.toFixed(1)}x`
	)

	return {
		scenario: scenario.name,
		adapter: 'cached',
		avgMs: avgWarm,
		totalMs: timings.reduce((a, b) => a + b, 0),
		opsPerSec: (timings.length / timings.reduce((a, b) => a + b, 0)) * 1000,
		timings,
		p50Ms: percentile(warmTimings, 50),
		p95Ms: percentile(warmTimings, 95),
		p99Ms: percentile(warmTimings, 99),
	}
}

// ============================================================================
// Main Runner
// ============================================================================

const runScenario = async (
	ctx: BenchContext,
	scenario: VfsPathScenario
): Promise<VfsPathResult> => {
	switch (scenario.category) {
		case 'path-resolution':
			return runPathResolutionBench(ctx, scenario)
		case 'handle-acquisition':
			return runHandleAcquisitionBench(ctx, scenario)
		case 'file-read':
			return runFileReadBench(ctx, scenario)
		case 'batch-operations':
			return runBatchOperationsBench(ctx, scenario)
		case 'cache-effectiveness':
			return runCacheEffectivenessBench(ctx, scenario)
		default:
			throw new Error(`Unknown scenario category: ${scenario.category}`)
	}
}

// ============================================================================
// Comlink API
// ============================================================================

export type ProgressCallback = (progress: {
	kind: 'scenario-start' | 'scenario-complete' | 'run-start' | 'run-complete'
	message: string
	scenario?: VfsPathScenario
	current?: number
	total?: number
}) => void

const benchmarkApi = {
	getScenarios(): VfsPathScenario[] {
		return scenarios
	},

	supportsOpfs(): boolean {
		return supportsOpfs()
	},

	async runAllBenchmarks(
		onProgress?: ProgressCallback
	): Promise<VfsPathBenchPayload[]> {
		if (!supportsOpfs()) {
			throw new Error('OPFS not supported')
		}

		onProgress?.({
			kind: 'run-start',
			message: `Starting VFS path benchmarks (${scenarios.length} scenarios)`,
			total: scenarios.length,
		})

		const allResults: VfsPathBenchPayload[] = []
		const rootHandle = await getRootDirectory('opfs', BENCH_ROOT)

		for (let i = 0; i < scenarios.length; i++) {
			const scenario = scenarios[i]!

			onProgress?.({
				kind: 'scenario-start',
				message: `Running: ${scenario.name}`,
				scenario,
				current: i + 1,
				total: scenarios.length,
			})

			const fs = createFs(rootHandle)
			const ctx: BenchContext = { fs, rootHandle }
			const start = performance.now()

			try {
				const result = await runScenario(ctx, scenario)
				const durationMs = performance.now() - start

				const payload: VfsPathBenchPayload = {
					scenario,
					results: [result],
					durationMs,
				}

				allResults.push(payload)

				onProgress?.({
					kind: 'scenario-complete',
					message: `Completed: ${scenario.name} (${result.avgMs.toFixed(3)}ms avg, ${result.opsPerSec.toFixed(0)} ops/sec)`,
					scenario,
					current: i + 1,
					total: scenarios.length,
				})
			} catch (error) {
				console.error(`Error in scenario ${scenario.name}:`, error)
				onProgress?.({
					kind: 'scenario-complete',
					message: `Failed: ${scenario.name} - ${error}`,
					scenario,
				})
			} finally {
				await cleanupBench(ctx)
			}
		}

		onProgress?.({
			kind: 'run-complete',
			message: `All benchmarks complete`,
		})

		return allResults
	},

	async runSingleScenario(
		scenarioName: string
	): Promise<VfsPathBenchPayload | null> {
		const scenario = scenarios.find((s) => s.name === scenarioName)
		if (!scenario) return null

		if (!supportsOpfs()) {
			throw new Error('OPFS not supported')
		}

		const rootHandle = await getRootDirectory('opfs', BENCH_ROOT)
		const fs = createFs(rootHandle)
		const ctx: BenchContext = { fs, rootHandle }
		const start = performance.now()

		try {
			const result = await runScenario(ctx, scenario)
			return {
				scenario,
				results: [result],
				durationMs: performance.now() - start,
			}
		} finally {
			await cleanupBench(ctx)
		}
	},
}

export type VfsPathBenchWorkerApi = typeof benchmarkApi

expose(benchmarkApi)
