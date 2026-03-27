/**
 * Tooltip Component Browser Tests
 *
 * Tests real browser interactions including:
 * - CSS Anchor Positioning
 * - Hover interactions
 * - Visual positioning and flip behavior
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-solid'
import { page } from 'vitest/browser'
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip'

describe('Tooltip Browser Tests', () => {
	afterEach(() => {
		cleanup()
		// Clean up any portal content
		document.querySelectorAll('[role="tooltip"]').forEach((el) => el.remove())
	})

	describe('rendering and positioning', () => {
		it('renders tooltip content in portal when triggered', async () => {
			render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Hover me</TooltipTrigger>
					<TooltipContent>Tooltip text</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Hover me')
			await expect.element(trigger).toBeVisible()

			// Hover to open
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			// Tooltip should be visible
			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip).toBeTruthy()
			expect(tooltip?.getAttribute('data-state')).toBe('open')
			expect(tooltip?.textContent).toContain('Tooltip text')
		})

		it('applies CSS anchor positioning styles', async () => {
			render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Trigger')
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			const tooltip = document.querySelector('[role="tooltip"]') as HTMLElement
			expect(tooltip).toBeTruthy()

			// Check CSS anchor positioning properties are applied
			expect(tooltip.style.position).toBe('fixed')
			expect(tooltip.style.getPropertyValue('position-anchor')).toMatch(
				/--tooltip-\d+/
			)
			expect(tooltip.style.getPropertyValue('position-area')).toBe('top')
		})

		it('applies correct position-area for different placements', async () => {
			const placements = [
				{ placement: 'top' as const, expected: 'top' },
				{ placement: 'bottom' as const, expected: 'bottom' },
				{ placement: 'left' as const, expected: 'left' },
				{ placement: 'right' as const, expected: 'right' },
			]

			for (const { placement, expected } of placements) {
				cleanup()
				document.querySelectorAll('[role="tooltip"]').forEach((el) => el.remove())

				render(() => (
					<Tooltip openDelay={0} placement={placement}>
						<TooltipTrigger>Trigger {placement}</TooltipTrigger>
						<TooltipContent>Content</TooltipContent>
					</Tooltip>
				))

				const trigger = page.getByText(`Trigger ${placement}`)
				await trigger.hover()
				await new Promise((resolve) => setTimeout(resolve, 50))

				const tooltip = document.querySelector('[role="tooltip"]') as HTMLElement
				expect(tooltip?.style.getPropertyValue('position-area')).toBe(expected)
				expect(tooltip?.getAttribute('data-placement')).toBe(placement)
			}
		})
	})

	describe('mouse interactions', () => {
		it('opens on hover and closes on mouse leave', async () => {
			render(() => (
				<div style={{ padding: '100px' }}>
					<Tooltip openDelay={0} closeDelay={0}>
						<TooltipTrigger>Hover target</TooltipTrigger>
						<TooltipContent>Tooltip content</TooltipContent>
					</Tooltip>
					<div data-testid="other" style={{ 'margin-top': '50px' }}>Other element</div>
				</div>
			))

			const trigger = page.getByText('Hover target')

			// Initially closed
			let tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('closed')

			// Hover to open
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('open')

			// Move away to close
			const otherElement = page.getByText('Other element')
			await otherElement.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('closed')
		})

		it('respects openDelay before showing', async () => {
			render(() => (
				<Tooltip openDelay={200}>
					<TooltipTrigger>Delayed trigger</TooltipTrigger>
					<TooltipContent>Delayed content</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Delayed trigger')

			// Hover
			await trigger.hover()

			// Should still be closed immediately
			let tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('closed')

			// Wait less than delay
			await new Promise((resolve) => setTimeout(resolve, 100))
			tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('closed')

			// Wait past delay
			await new Promise((resolve) => setTimeout(resolve, 150))
			tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip?.getAttribute('data-state')).toBe('open')
		})
	})

	describe('accessibility', () => {
		it('links trigger to content via aria-describedby', async () => {
			render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Accessible trigger</TooltipTrigger>
					<TooltipContent>Accessible content</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Accessible trigger')

			// Before hover, no aria-describedby
			const triggerEl = document.querySelector('button')
			expect(triggerEl?.getAttribute('aria-describedby')).toBeFalsy()

			// Hover to open
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			// Now has aria-describedby pointing to tooltip
			const tooltip = document.querySelector('[role="tooltip"]')
			expect(triggerEl?.getAttribute('aria-describedby')).toBe(tooltip?.id)
		})

		it('content has correct role and id', async () => {
			render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content with role</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Trigger')
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip).toBeTruthy()
			expect(tooltip?.id).toMatch(/tooltip-content-/)
		})
	})

	describe('arrow', () => {
		it('renders arrow when enabled', async () => {
			render(() => (
				<Tooltip openDelay={0}>
					<TooltipTrigger>Arrow trigger</TooltipTrigger>
					<TooltipContent arrow>Content with arrow</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Arrow trigger')
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			const tooltip = document.querySelector('[role="tooltip"]')
			expect(tooltip).toBeTruthy()

			// Arrow is a child div with rotate transform
			const arrow = tooltip?.querySelector('div[style*="rotate(45deg)"]')
			expect(arrow).toBeTruthy()
		})
	})

	describe('gap and spacing', () => {
		it('applies custom gap', async () => {
			render(() => (
				<Tooltip openDelay={0} placement="top">
					<TooltipTrigger>Gap trigger</TooltipTrigger>
					<TooltipContent gap={20}>Content with gap</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Gap trigger')
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			const tooltip = document.querySelector('[role="tooltip"]') as HTMLElement
			// For top placement, gap is applied as margin-bottom
			expect(tooltip?.style.marginBottom).toBe('20px')
		})

		it('adds arrow size to gap when arrow is present', async () => {
			render(() => (
				<Tooltip openDelay={0} placement="top">
					<TooltipTrigger>Arrow gap trigger</TooltipTrigger>
					<TooltipContent gap={8} arrow arrowSize={6}>
						Content
					</TooltipContent>
				</Tooltip>
			))

			const trigger = page.getByText('Arrow gap trigger')
			await trigger.hover()
			await new Promise((resolve) => setTimeout(resolve, 50))

			const tooltip = document.querySelector('[role="tooltip"]') as HTMLElement
			// Gap (8) + arrow size (6) = 14
			expect(tooltip?.style.marginBottom).toBe('14px')
		})
	})
})
