// Performance metrics utilities for typing benchmarks

export type BenchmarkMetrics = {
	/** Time for a single keystroke to complete (keydown to render) */
	keystrokeLatencies: number[]
	/** Total test duration in ms */
	totalDuration: number
	/** Number of operations performed */
	operationCount: number
}

export type MetricsSummary = {
	min: number
	max: number
	mean: number
	median: number
	p95: number
	p99: number
	stdDev: number
}

const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0
	const index = (p / 100) * (sorted.length - 1)
	const lower = Math.floor(index)
	const upper = Math.ceil(index)
	if (lower === upper) return sorted[lower]!
	const fraction = index - lower
	return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction
}

const standardDeviation = (values: number[], mean: number): number => {
	if (values.length === 0) return 0
	const squareDiffs = values.map((value) => Math.pow(value - mean, 2))
	const avgSquareDiff =
		squareDiffs.reduce((sum, val) => sum + val, 0) / values.length
	return Math.sqrt(avgSquareDiff)
}

export const summarizeMetrics = (latencies: number[]): MetricsSummary => {
	if (latencies.length === 0) {
		return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdDev: 0 }
	}

	const sorted = [...latencies].sort((a, b) => a - b)
	const sum = sorted.reduce((acc, val) => acc + val, 0)
	const mean = sum / sorted.length

	return {
		min: sorted[0]!,
		max: sorted[sorted.length - 1]!,
		mean,
		median: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		p99: percentile(sorted, 99),
		stdDev: standardDeviation(sorted, mean),
	}
}

export const formatMetricsSummary = (
	name: string,
	summary: MetricsSummary
): string => {
	return [
		`📊 ${name}`,
		`  Min:    ${summary.min.toFixed(2)}ms`,
		`  Max:    ${summary.max.toFixed(2)}ms`,
		`  Mean:   ${summary.mean.toFixed(2)}ms`,
		`  Median: ${summary.median.toFixed(2)}ms`,
		`  P95:    ${summary.p95.toFixed(2)}ms`,
		`  P99:    ${summary.p99.toFixed(2)}ms`,
		`  StdDev: ${summary.stdDev.toFixed(2)}ms`,
	].join('\n')
}

export const collectMetrics = async (
	runBenchmark: () => Promise<number[]>
): Promise<BenchmarkMetrics> => {
	const start = performance.now()
	const keystrokeLatencies = await runBenchmark()
	const totalDuration = performance.now() - start

	return {
		keystrokeLatencies,
		totalDuration,
		operationCount: keystrokeLatencies.length,
	}
}

export const waitForNextFrame = (): Promise<void> => {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export const waitForFrames = (count: number = 2): Promise<void> => {
	return new Promise((resolve) => {
		let remaining = count
		const tick = () => {
			remaining--
			if (remaining <= 0) {
				resolve()
			} else {
				requestAnimationFrame(tick)
			}
		}
		requestAnimationFrame(tick)
	})
}
