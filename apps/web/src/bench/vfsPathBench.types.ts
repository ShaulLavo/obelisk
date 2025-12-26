/**
 * VFS Path/Tree Walking Benchmark Types
 *
 * These benchmarks focus on measuring the performance impact of
 * directory handle acquisition and path resolution - specifically
 * the "tree walking" overhead when accessing files at various depths.
 */

export type VfsPathScenarioCategory =
	| 'path-resolution'
	| 'handle-acquisition'
	| 'file-read'
	| 'batch-operations'
	| 'cache-effectiveness'

export type VfsPathScenario = {
	name: string
	category: VfsPathScenarioCategory
	description: string
	/** Depth of paths to test (e.g., depth 5 = a/b/c/d/e/file.txt) */
	depth?: number
	/** Number of files to operate on */
	fileCount?: number
	/** Size of file content in bytes */
	fileSizeBytes?: number
	/** Whether to run operations in parallel */
	parallel?: boolean
	/** Iterations for averaging */
	iterations?: number
}

export type VfsPathResult = {
	scenario: string
	adapter: string
	/** Average time per operation in ms */
	avgMs: number
	/** Total time for all operations */
	totalMs: number
	/** Operations per second */
	opsPerSec: number
	/** Individual timings for percentile analysis */
	timings?: number[]
	/** P50/P95/P99 if available */
	p50Ms?: number
	p95Ms?: number
	p99Ms?: number
}

export type VfsPathBenchPayload = {
	scenario: VfsPathScenario
	results: VfsPathResult[]
	durationMs: number
}
