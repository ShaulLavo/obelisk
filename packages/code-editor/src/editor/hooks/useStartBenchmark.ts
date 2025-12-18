import { onCleanup, type Accessor } from 'solid-js'

declare global {
	interface Window {
		startBenchmark?: () => Promise<void>
	}
}

export type UseStartBenchmarkOptions = {
	scrollElement: Accessor<HTMLDivElement | null>
}

export const useStartBenchmark = (options: UseStartBenchmarkOptions) => {
	const previous = window.startBenchmark

	window.startBenchmark = async (): Promise<void> => {
		const el = options.scrollElement()
		if (!el) return

		el.style.scrollBehavior = 'auto'
		el.scrollTop = 0
		const maxScroll = el.scrollHeight - el.clientHeight
		const cycles = 20

		let frames = 0
		let currentCycle = 0

		let position = 0
		let velocity = 0 // px/s
		let direction: 1 | -1 = 1

		const ACCEL = 2_000_000 // px/s^2
		const MAX_VEL = 2_000_000 // px/s

		const start = performance.now()
		let last = start

		return new Promise<void>((resolve) => {
			const animate = (now: number) => {
				const dt = Math.min(0.05, (now - last) / 1000) // seconds, clamp 50ms
				last = now

				velocity = Math.min(MAX_VEL, velocity + ACCEL * dt)
				position += velocity * dt * direction

				if (position > maxScroll) {
					position = maxScroll - (position - maxScroll)
					direction = -1
				} else if (position < 0) {
					position = -position
					direction = 1
					currentCycle++
				}

				el.scrollTop = position
				frames++

				if (currentCycle < cycles) {
					requestAnimationFrame(animate)
				} else {
					const duration = now - start
					const fps = Math.round((frames / duration) * 1000)
					console.log(
						`Benchmark complete: ${fps} FPS, ${duration.toFixed(2)}ms, ${frames} frames`
					)
					el.scrollTop = 0
					resolve()
				}
			}

			requestAnimationFrame(animate)
		})
	}

	onCleanup(() => {
		if (previous) {
			window.startBenchmark = previous
		} else {
			delete window.startBenchmark
		}
	})
}
