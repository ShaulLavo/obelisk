import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@solidjs/testing-library'
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip'

describe('Tooltip', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		cleanup()
		// Clean up any portal content
		document.body.innerHTML = ''
	})

	describe('rendering', () => {
		it('renders trigger', () => {
			const { getByText } = render(() => (
				<Tooltip>
					<TooltipTrigger>Hover me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			expect(getByText('Hover me')).toBeTruthy()
		})

		it('content is hidden by default', () => {
			render(() => (
				<Tooltip>
					<TooltipTrigger>Hover me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			// Content should be in closed state initially
			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('closed')
		})
	})

	describe('mouse interactions', () => {
		it('shows tooltip on hover after delay', async () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={100}>
					<TooltipTrigger>Hover me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Hover me')

			// Hover
			fireEvent.mouseEnter(trigger)

			// Not visible yet (delay not elapsed)
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('closed')

			// Advance timers past delay
			vi.advanceTimersByTime(150)

			// Now visible (Portal renders to body)
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('open')
			expect(document.body.textContent).toContain('Tooltip text')
		})

		it('hides tooltip on mouse leave', async () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0} closeDelay={0}>
					<TooltipTrigger>Hover me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Hover me')

			// Hover to open
			fireEvent.mouseEnter(trigger)
			vi.advanceTimersByTime(10)
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('open')

			// Leave to close
			fireEvent.mouseLeave(trigger)
			vi.advanceTimersByTime(10)
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('closed')
		})

		it('cancels open if mouse leaves before delay', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={200}>
					<TooltipTrigger>Hover me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Hover me')

			// Hover
			fireEvent.mouseEnter(trigger)
			vi.advanceTimersByTime(50) // Not enough time

			// Leave before delay completes
			fireEvent.mouseLeave(trigger)
			vi.advanceTimersByTime(200) // Wait past original delay

			// Should stay closed
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('closed')
		})
	})

	describe('keyboard interactions', () => {
		it('shows tooltip on focus', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Focus me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Focus me')

			fireEvent.focus(trigger)
			vi.advanceTimersByTime(10)

			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('open')
		})

		it('hides tooltip on blur', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0} closeDelay={0}>
					<TooltipTrigger>Focus me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Focus me')

			// Focus to open
			fireEvent.focus(trigger)
			vi.advanceTimersByTime(10)
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('open')

			// Blur to close
			fireEvent.blur(trigger)
			vi.advanceTimersByTime(10)
			expect(document.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('closed')
		})
	})

	describe('accessibility', () => {
		it('trigger has aria-describedby when open', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Description</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Trigger')

			// Initially no aria-describedby (or empty)
			const initialAriaDescribedby = trigger.getAttribute('aria-describedby')
			expect(!initialAriaDescribedby || initialAriaDescribedby === '').toBe(true)

			// Open tooltip
			fireEvent.mouseEnter(trigger)
			vi.advanceTimersByTime(10)

			// Now has aria-describedby pointing to tooltip
			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('open')
			expect(trigger.getAttribute('aria-describedby')).toBe(tooltip?.id)
		})

		it('content has role="tooltip"', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Description</TooltipContent>
				</Tooltip>
			))

			fireEvent.mouseEnter(getByText('Trigger'))
			vi.advanceTimersByTime(10)

			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip).toBeTruthy()
			expect(tooltip?.getAttribute('data-state')).toBe('open')
		})
	})

	describe('controlled state', () => {
		it('calls onOpenChange callback', () => {
			const onOpenChange = vi.fn()

			const { getByText } = render(() => (
				<Tooltip openDelay={0} closeDelay={0} onOpenChange={onOpenChange}>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content</TooltipContent>
				</Tooltip>
			))

			const trigger = getByText('Trigger')

			fireEvent.mouseEnter(trigger)
			vi.advanceTimersByTime(10)

			expect(onOpenChange).toHaveBeenCalledWith(true)

			fireEvent.mouseLeave(trigger)
			vi.advanceTimersByTime(10)

			expect(onOpenChange).toHaveBeenCalledWith(false)
		})
	})

	describe('placement', () => {
		it('content has data-placement attribute', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent placement="bottom">Content</TooltipContent>
				</Tooltip>
			))

			fireEvent.mouseEnter(getByText('Trigger'))
			vi.advanceTimersByTime(10)

			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-placement')).toBe('bottom')
		})

		it('uses default placement from Tooltip root', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0} placement="right">
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content</TooltipContent>
				</Tooltip>
			))

			fireEvent.mouseEnter(getByText('Trigger'))
			vi.advanceTimersByTime(10)

			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-placement')).toBe('right')
		})

		it('content placement overrides root placement', () => {
			const { getByText } = render(() => (
				<Tooltip openDelay={0} placement="right">
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent placement="left">Content</TooltipContent>
				</Tooltip>
			))

			fireEvent.mouseEnter(getByText('Trigger'))
			vi.advanceTimersByTime(10)

			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-placement')).toBe('left')
		})
	})
})
