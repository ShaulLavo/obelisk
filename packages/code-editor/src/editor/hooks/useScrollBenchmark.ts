import { onCleanup, type Accessor } from 'solid-js'

export type BenchmarkPhase =
	| 'down'
	| 'up'
	| 'jumpV'
	| 'right'
	| 'left'
	| 'jumpH'

export type BenchmarkOptions = {
	/**
	 * @deprecated Use `phases` instead.
	 * If true, includes horizontal phases (right, left, jumpH).
	 * Ignored if `phases` is provided.
	 */
	includeHorizontal?: boolean
	/**
	 * Specific phases to run. If provided, only these phases will be executed.
	 * If omitted, runs default set (vertical only, or all if includeHorizontal is true).
	 */
	phases?: BenchmarkPhase[]
}

/**
 * Fluent builder for scroll benchmarks.
 * Usage: scrollBench().down().up().vjump().start()
 */
export class ScrollBenchmarkBuilder {
	private phases: BenchmarkPhase[] = []
	private runFn: (options?: BenchmarkOptions) => Promise<BenchmarkResults>

	constructor(
		runFn: (options?: BenchmarkOptions) => Promise<BenchmarkResults>
	) {
		this.runFn = runFn
	}

	down() {
		this.phases.push('down')
		return this
	}

	up() {
		this.phases.push('up')
		return this
	}

	vjump() {
		this.phases.push('jumpV')
		return this
	}

	right() {
		this.phases.push('right')
		return this
	}

	left() {
		this.phases.push('left')
		return this
	}

	hjump() {
		this.phases.push('jumpH')
		return this
	}

	/** Convenience: add all vertical phases (down, up, jumpV) */
	vertical() {
		return this.down().up().vjump()
	}

	/** Convenience: add all horizontal phases (right, left, jumpH) */
	horizontal() {
		return this.right().left().hjump()
	}

	/** Convenience: add all phases */
	all() {
		return this.vertical().horizontal()
	}

	/** Run the benchmark with the selected phases */
	start(): Promise<BenchmarkResults> {
		if (this.phases.length === 0) {
			// Default to vertical phases if none selected
			return this.runFn({ phases: ['down', 'up', 'jumpV'] })
		}
		return this.runFn({ phases: this.phases })
	}

	/** Alias for start() */
	run(): Promise<BenchmarkResults> {
		return this.start()
	}
}

declare global {
	interface Window {
		scrollBench?: () => ScrollBenchmarkBuilder
	}
}

export type PhaseStats = {
	duration: number
	frames: number
	fps: number
}

// Initialize with zeros
const EMPTY_STATS: PhaseStats = { duration: 0, frames: 0, fps: 0 }

export type BenchmarkResults = {
	[K in BenchmarkPhase]: PhaseStats
}

export type UseScrollBenchmarkOptions = {
	scrollElement: Accessor<HTMLDivElement | null>
}

export const useScrollBenchmark = (options: UseScrollBenchmarkOptions) => {
	const previousBench = window.scrollBench

	// The core benchmark function
	const runBenchmark = async (
		benchOptions?: BenchmarkOptions
	): Promise<BenchmarkResults> => {
		const { includeHorizontal = false, phases: requestedPhases } =
			benchOptions ?? {}
		const el = options.scrollElement()

		const stats: BenchmarkResults = {
			down: { ...EMPTY_STATS },
			up: { ...EMPTY_STATS },
			jumpV: { ...EMPTY_STATS },
			right: { ...EMPTY_STATS },
			left: { ...EMPTY_STATS },
			jumpH: { ...EMPTY_STATS },
		}

		if (!el) return stats

		// Determine which phases to run
		let phasesToRun: Set<BenchmarkPhase>
		if (requestedPhases) {
			phasesToRun = new Set(requestedPhases)
		} else {
			// Backward compatibility logic
			phasesToRun = new Set(['down', 'up', 'jumpV'])
			if (includeHorizontal) {
				phasesToRun.add('right')
				phasesToRun.add('left')
				phasesToRun.add('jumpH')
			}
		}

		// Reset to origin
		el.style.scrollBehavior = 'auto'
		el.scrollTop = 0
		el.scrollLeft = 0

		const maxScrollY = el.scrollHeight - el.clientHeight
		const maxScrollX = el.scrollWidth - el.clientWidth
		const stepY = el.clientHeight / 2
		const stepX = el.clientWidth / 2
		const JUMP_COUNT = 200

		// Single frame wait - for smooth scrolling phases
		const waitForRender = () =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					resolve()
				})
			})

		// --- PHASE 1: SCROLL DOWN ---
		if (phasesToRun.has('down')) {
			const start = performance.now()
			let currentY = 0
			let frames = 0

			while (currentY < maxScrollY) {
				currentY = Math.min(maxScrollY, currentY + stepY)
				el.scrollTop = currentY
				frames++
				await waitForRender()
			}

			stats.down.duration = performance.now() - start
			stats.down.frames = frames
			stats.down.fps = Math.round((frames / stats.down.duration) * 1000)
		}

		// --- PHASE 2: SCROLL UP ---
		if (phasesToRun.has('up')) {
			const start = performance.now()
			let currentY = el.scrollTop // Start from current pos (usually bottom if down ran)
			if (!phasesToRun.has('down')) currentY = maxScrollY // If down didn't run, assume start at bottom? Or ensure we are at bottom?
			// Actually safer to force position if independent execution
			if (!phasesToRun.has('down')) el.scrollTop = maxScrollY
			// Re-read strictly
			currentY = el.scrollTop

			let frames = 0

			while (currentY > 0) {
				currentY = Math.max(0, currentY - stepY)
				el.scrollTop = currentY
				frames++
				await waitForRender()
			}

			stats.up.duration = performance.now() - start
			stats.up.frames = frames
			stats.up.fps = Math.round((frames / stats.up.duration) * 1000)
		}

		// --- PHASE 3: RANDOM VERTICAL JUMPS ---
		if (phasesToRun.has('jumpV')) {
			const start = performance.now()
			let frames = 0

			for (let i = 0; i < JUMP_COUNT; i++) {
				const targetY = Math.random() * maxScrollY
				el.scrollTop = targetY
				frames++
				await waitForRender()
			}

			stats.jumpV.duration = performance.now() - start
			stats.jumpV.frames = frames
			stats.jumpV.fps = Math.round((frames / stats.jumpV.duration) * 1000)
		}

		// --- HORIZONTAL CHECKS ---
		const hasHorizontal = maxScrollX > 0

		// --- PHASE 4: SCROLL RIGHT ---
		if (phasesToRun.has('right') && hasHorizontal) {
			el.scrollLeft = 0 // Ensure start at left
			const start = performance.now()
			let currentX = 0
			let frames = 0

			while (currentX < maxScrollX) {
				currentX = Math.min(maxScrollX, currentX + stepX)
				el.scrollLeft = currentX
				frames++
				await waitForRender()
			}

			stats.right.duration = performance.now() - start
			stats.right.frames = frames
			stats.right.fps = Math.round((frames / stats.right.duration) * 1000)
		}

		// --- PHASE 5: SCROLL LEFT ---
		if (phasesToRun.has('left') && hasHorizontal) {
			if (!phasesToRun.has('right')) el.scrollLeft = maxScrollX // Force start at right if needed
			const start = performance.now()
			let currentX = el.scrollLeft
			let frames = 0

			while (currentX > 0) {
				currentX = Math.max(0, currentX - stepX)
				el.scrollLeft = currentX
				frames++
				await waitForRender()
			}

			stats.left.duration = performance.now() - start
			stats.left.frames = frames
			stats.left.fps = Math.round((frames / stats.left.duration) * 1000)
		}

		// --- PHASE 6: RANDOM HORIZONTAL JUMPS ---
		if (phasesToRun.has('jumpH') && hasHorizontal) {
			const start = performance.now()
			let frames = 0

			for (let i = 0; i < JUMP_COUNT; i++) {
				const targetX = Math.random() * maxScrollX
				el.scrollLeft = targetX
				frames++
				await waitForRender()
			}

			stats.jumpH.duration = performance.now() - start
			stats.jumpH.frames = frames
			stats.jumpH.fps = Math.round((frames / stats.jumpH.duration) * 1000)
		}

		// --- REPORT ---
		// --- REPORT ---

		const reportData: Record<
			string,
			{ 'Time (ms)': string; Frames: number; FPS: number }
		> = {}

		if (phasesToRun.has('down'))
			reportData['Scroll Down'] = fmtStats(stats.down)
		if (phasesToRun.has('up')) reportData['Scroll Up'] = fmtStats(stats.up)
		if (phasesToRun.has('jumpV'))
			reportData['Random Jump (V)'] = fmtStats(stats.jumpV)

		if (phasesToRun.has('right'))
			reportData['Scroll Right'] = fmtStats(stats.right)
		if (phasesToRun.has('left'))
			reportData['Scroll Left'] = fmtStats(stats.left)
		if (phasesToRun.has('jumpH'))
			reportData['Random Jump (H)'] = fmtStats(stats.jumpH)

		console.table(reportData)

		// Reset
		el.scrollTop = 0
		el.scrollLeft = 0

		return stats
	}

	// Register the fluent builder API on window
	window.scrollBench = () => new ScrollBenchmarkBuilder(runBenchmark)

	onCleanup(() => {
		if (previousBench) {
			window.scrollBench = previousBench
		} else {
			delete window.scrollBench
		}
	})
}

function fmtStats(stats: PhaseStats) {
	return {
		'Time (ms)': stats.duration.toFixed(2),
		Frames: stats.frames,
		FPS: stats.fps,
	}
}
