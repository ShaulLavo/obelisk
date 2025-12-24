import { describe, expect, it } from 'vitest'
import { createSignal } from 'solid-js'
import { render } from 'vitest-browser-solid'
import { Syntax } from './Syntax'

// ============================================================================
// Syntax Component Tests - Partial Rendering
// ============================================================================

describe('Syntax', () => {
	describe('full line rendering (default)', () => {
		it('renders entire text when no column bounds specified', async () => {
			const text = 'Hello, World!'
			const screen = render(() => <Syntax text={text} />)

			await expect.element(screen.getByText(text)).toBeVisible()
		})

		it('renders empty string without error', async () => {
			const screen = render(() => <Syntax text="" />)
			// Container should exist but be empty
			expect(screen.container.textContent).toBe('')
		})
	})

	describe('partial rendering with columnStart/columnEnd', () => {
		it('renders only the specified range', async () => {
			const text = 'ABCDEFGHIJ'
			const screen = render(() => (
				<Syntax text={text} columnStart={2} columnEnd={7} />
			))

			// Should render "CDEFG" (indices 2-6)
			await expect.element(screen.getByText('CDEFG')).toBeVisible()
		})

		it('renders from start when columnStart is 0', async () => {
			const text = 'ABCDEFGHIJ'
			const screen = render(() => (
				<Syntax text={text} columnStart={0} columnEnd={3} />
			))

			await expect.element(screen.getByText('ABC')).toBeVisible()
		})

		it('renders to end when columnEnd exceeds text length', async () => {
			const text = 'SHORT'
			const screen = render(() => (
				<Syntax text={text} columnStart={2} columnEnd={100} />
			))

			// Should render "ORT" (from 2 to end)
			await expect.element(screen.getByText('ORT')).toBeVisible()
		})

		it('renders nothing when columnStart >= columnEnd', async () => {
			const text = 'ABCDEFGHIJ'
			const screen = render(() => (
				<Syntax text={text} columnStart={5} columnEnd={5} />
			))

			expect(screen.container.textContent).toBe('')
		})

		it('handles columnStart past text length', async () => {
			const text = 'SHORT'
			const screen = render(() => (
				<Syntax text={text} columnStart={10} columnEnd={20} />
			))

			expect(screen.container.textContent).toBe('')
		})
	})

	describe('syntax highlighting with partial ranges', () => {
		it('clips highlight segments to visible range', async () => {
			const text = 'const foo = bar'
			const highlights = [
				{ start: 0, end: 5, className: 'keyword', scope: 'keyword' },
				{ start: 6, end: 9, className: 'variable', scope: 'variable' },
				{ start: 10, end: 11, className: 'operator', scope: 'operator' },
				{ start: 12, end: 15, className: 'variable', scope: 'variable' },
			]

			// Render only columns 6-12 ("foo = b")
			const screen = render(() => (
				<Syntax
					text={text}
					highlightSegments={highlights}
					columnStart={6}
					columnEnd={13}
				/>
			))

			// Should contain "foo = b"
			expect(screen.container.textContent).toBe('foo = b')

			// Should have highlight spans
			const variableSpans = screen.container.querySelectorAll(
				'[data-highlight-scope="variable"]'
			)
			expect(variableSpans.length).toBeGreaterThan(0)
		})

		it('skips highlights entirely outside visible range', async () => {
			const text = 'ABCDEFGHIJ'
			const highlights = [
				{ start: 0, end: 3, className: 'before', scope: 'before' },
				{ start: 8, end: 10, className: 'after', scope: 'after' },
			]

			// Render only columns 4-7 ("EFGH")
			const screen = render(() => (
				<Syntax
					text={text}
					highlightSegments={highlights}
					columnStart={4}
					columnEnd={8}
				/>
			))

			expect(screen.container.textContent).toBe('EFGH')

			// No highlight spans should exist
			const spans = screen.container.querySelectorAll('[data-highlight-scope]')
			expect(spans.length).toBe(0)
		})
	})

	describe('bracket depth coloring with partial ranges', () => {
		it('applies bracket colors at correct indices', async () => {
			const text = '((()))'
			const bracketDepths = { 0: 1, 1: 2, 2: 3, 3: 3, 4: 2, 5: 1 }

			const screen = render(() => (
				<Syntax
					text={text}
					bracketDepths={bracketDepths}
					columnStart={1}
					columnEnd={5}
				/>
			))

			// Should render "(())" (indices 1-4)
			expect(screen.container.textContent).toBe('(())')

			// Should have depth data attributes
			const depthSpans = screen.container.querySelectorAll('[data-depth]')
			expect(depthSpans.length).toBeGreaterThan(0)
		})
	})

	describe('token reuse', () => {
		it('reuses token nodes when text updates with same run count', async () => {
			const [text, setText] = createSignal('foo')
			const highlights = [
				{ start: 0, end: 3, className: 'keyword', scope: 'keyword' },
			]

			const screen = render(() => (
				<Syntax text={text()} highlightSegments={highlights} />
			))

			const firstSpan = screen.container.querySelector('span')
			expect(firstSpan).not.toBeNull()

			setText('bar')

			await expect.element(screen.getByText('bar')).toBeVisible()

			const nextSpan = screen.container.querySelector('span')
			expect(nextSpan).toBe(firstSpan)
		})
	})
})
