import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-solid'
import { createSignal } from 'solid-js'
import { createFixedRowVirtualizer } from './createFixedRowVirtualizer'

// ============================================================================
// DOM Integration Tests - Runs in real browser via Vitest Browser Mode
// ============================================================================

describe('createFixedRowVirtualizer (browser)', () => {
	const VirtualizerTest = (props: {
		count?: number
		enabled?: boolean
		rowHeight?: number
		overscan?: number
		onMount?: (state: {
			virtualizer: ReturnType<typeof createFixedRowVirtualizer>
			setCount: (count: number) => void
			setEnabled: (enabled: boolean) => void
		}) => void
	}) => {
		const [count, setCount] = createSignal(props.count ?? 100)
		const [enabled, setEnabled] = createSignal(props.enabled ?? true)
		let scrollElement!: HTMLDivElement

		const virtualizer = createFixedRowVirtualizer({
			count,
			enabled,
			scrollElement: () => scrollElement,
			rowHeight: () => props.rowHeight ?? 20,
			overscan: props.overscan ?? 0,
		})

		props.onMount?.({ virtualizer, setCount, setEnabled })

		return (
			<div
				ref={scrollElement}
				style={{
					height: '200px',
					width: '300px',
					overflow: 'auto',
					position: 'relative',
				}}
				data-testid="container"
			>
				<div
					style={{
						height: `${virtualizer.totalSize()}px`,
						width: '100%',
						position: 'relative',
					}}
				>
					{virtualizer.virtualItems().map((item) => (
						<div
							style={{
								position: 'absolute',
								top: `${item.start}px`,
								height: `${item.size}px`,
								width: '100%',
							}}
							data-index={item.index}
						>
							Row {item.index}
						</div>
					))}
				</div>
			</div>
		)
	}

	it('initializes with correct values', async () => {
		let v: any
		render(() => <VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />)

		await expect.poll(() => v.viewportHeight()).toBe(200)
		expect(v.scrollTop()).toBe(0)
		expect(v.totalSize()).toBe(2000) // 100 * 20
		expect(v.isScrolling()).toBe(false)
		expect(v.scrollDirection()).toBe(null)
	})

	it('computes virtual items for visible range', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest
				overscan={2}
				onMount={(inst) => (v = inst.virtualizer)}
			/>
		))

		await expect.poll(() => v.virtualItems().length).toBeGreaterThan(0)
		const items = v.virtualItems()
		// viewport 200px / 20px = ~10 visible + 2 overscan each side
		expect(items.length).toBeGreaterThanOrEqual(10)
		expect(items.length).toBeLessThanOrEqual(16)
		expect(items[0]?.index).toBe(0)

		await expect.element(screen.getByText('Row 0')).toBeVisible()
	})

	it('scrollToIndex scrolls to correct position', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />
		))

		// Wait for mount
		await expect.poll(() => v.viewportHeight()).toBe(200)

		// Scroll to index 50 at start
		v.scrollToIndex(50, { align: 'start' })

		// Wait for scroll to complete
		await expect
			.poll(() => screen.getByTestId('container').element().scrollTop)
			.toBe(1000) // 50 * 20
	})

	it('scrollToIndex with center alignment', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />
		))

		await expect.poll(() => v.viewportHeight()).toBe(200)

		// Scroll to index 50 centered
		v.scrollToIndex(50, { align: 'center' })

		// Item start = 50 * 20 = 1000
		// Center offset = 1000 - (200 - 20) / 2 = 1000 - 90 = 910
		await expect
			.poll(() => screen.getByTestId('container').element().scrollTop)
			.toBe(910)
	})

	it('scrollToIndex with auto alignment - already visible', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />
		))

		await expect.poll(() => v.viewportHeight()).toBe(200)

		const initialScrollTop = screen.getByTestId('container').element().scrollTop

		// Index 5 should already be visible at scrollTop 0 (viewport shows 0-9)
		v.scrollToIndex(5, { align: 'auto' })

		// Should not have scrolled
		await expect
			.poll(() => screen.getByTestId('container').element().scrollTop)
			.toBe(initialScrollTop)
	})

	it('scrollToOffset scrolls to correct position', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />
		))

		await expect.poll(() => v.viewportHeight()).toBe(200)

		v.scrollToOffset(500)

		await expect
			.poll(() => screen.getByTestId('container').element().scrollTop)
			.toBe(500)
	})

	it('scrollToOffset clamps to max offset', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />
		))

		await expect.poll(() => v.viewportHeight()).toBe(200)

		// Total size = 2000, viewport = 200, max scroll = 1800
		v.scrollToOffset(5000)

		await expect
			.poll(() => screen.getByTestId('container').element().scrollTop)
			.toBe(1800)
	})

	it('tracks scroll direction during scroll', async () => {
		let v: any
		const screen = render(() => (
			<VirtualizerTest onMount={(inst) => (v = inst.virtualizer)} />
		))

		await expect.poll(() => v.viewportHeight()).toBe(200)

		// Scroll down
		screen.getByTestId('container').element().scrollTop = 100

		// Check forward scroll
		await expect.poll(() => v.scrollDirection()).toBe('forward')
		expect(v.isScrolling()).toBe(true)

		// Scroll up
		screen.getByTestId('container').element().scrollTop = 50

		await expect.poll(() => v.scrollDirection()).toBe('backward')
	})

	it('updates when count changes', async () => {
		let countSetter: any
		let v: any
		render(() => (
			<VirtualizerTest
				onMount={(inst) => {
					v = inst.virtualizer
					countSetter = inst.setCount
				}}
			/>
		))

		await expect.poll(() => v.totalSize()).toBe(2000)

		countSetter(50)

		await expect.poll(() => v.totalSize()).toBe(1000)
	})

	it('returns empty items when disabled', async () => {
		let enabledSetter: any
		let v: any
		render(() => (
			<VirtualizerTest
				onMount={(inst) => {
					v = inst.virtualizer
					enabledSetter = inst.setEnabled
				}}
			/>
		))

		await expect.poll(() => v.virtualItems().length).toBeGreaterThan(0)

		enabledSetter(false)

		await expect.poll(() => v.virtualItems().length).toBe(0)
	})
})
