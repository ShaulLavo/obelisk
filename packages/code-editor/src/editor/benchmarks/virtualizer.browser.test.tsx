import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from 'vitest-browser-solid'
import { createSignal, For } from 'solid-js'
import { useScrollBenchmark } from '../hooks/useScrollBenchmark'
import { BENCHMARK_PRESETS } from './generateContent'

describe.skip('Virtualizer Performance Benchmark', () => {
	let container: HTMLDivElement

	beforeEach(() => {
		container = document.createElement('div')
		container.style.cssText = `
            width: 100vw;
            height: 100vh;
            position: fixed;
            top: 0;
            left: 0;
        `
		document.body.appendChild(container)
	})

	afterEach(() => {
		container.remove()
	})

	const BenchmarkComponent = (props: {
		config: { lines: number; charsPerLine: number }
		onScrollEl: (el: HTMLDivElement) => void
	}) => {
		const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | null>(null)

		useScrollBenchmark({ scrollElement: scrollEl })

		return (
			<div
				ref={(el) => {
					setScrollEl(el)
					props.onScrollEl(el)
				}}
				style={{
					width: '100%',
					height: '100%',
					overflow: 'auto',
					display: 'flex',
					'flex-wrap': 'wrap',
					'align-content': 'flex-start',
				}}
			>
				<For each={Array.from({ length: props.config.lines })}>
					{(_, i) => (
						<div
							style={{
								height: '24px',
								'white-space': 'pre',
								'font-family': 'monospace',
							}}
						>
							{i()} {'x'.repeat(props.config.charsPerLine)}
						</div>
					)}
				</For>
			</div>
		)
	}

	it(
		'runs default vertical scrolling phases (down, up, jumpV)',
		async () => {
			let scrollEl: HTMLDivElement | null = null
			const { unmount } = render(
				() => (
					<BenchmarkComponent
						config={BENCHMARK_PRESETS.normal}
						onScrollEl={(el) => (scrollEl = el)}
					/>
				),
				{ container }
			)

			await expect.poll(() => scrollEl).toBeTruthy()

			const results = await window.scrollBenchmark?.()
			expect(results).toBeDefined()

			// Default runs vertical phases
			expect(results?.down.frames).toBeGreaterThan(0)
			expect(results?.up.frames).toBeGreaterThan(0)
			expect(results?.jumpV.frames).toBeGreaterThan(0)

			// No horizontal by default
			expect(results?.right.frames).toBe(0)

			unmount()
		},
		60_000 * 3
	)

	it(
		'runs horizontal scrolling phases (right, left) for wide content',
		async () => {
			let scrollEl: HTMLDivElement | null = null
			const { unmount } = render(
				() => (
					<BenchmarkComponent
						config={BENCHMARK_PRESETS.wide}
						onScrollEl={(el) => (scrollEl = el)}
					/>
				),
				{ container }
			)

			await expect.poll(() => scrollEl).toBeTruthy()

			const results = await window.scrollBenchmark?.({
				phases: ['right', 'left'],
			})

			expect(results?.right.frames).toBeGreaterThan(0)
			expect(results?.left.frames).toBeGreaterThan(0)
			expect(results?.down.frames).toBe(0)

			unmount()
		},
		60_000 * 3
	)
})
