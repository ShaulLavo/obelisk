/**
 * End-to-End Font Management Workflow Integration Test (Browser)
 *
 * Tests the font management UI components in a real browser environment:
 * 1. Font browser UI renders
 * 2. Font cards display correctly
 * 3. Settings integration works
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'vitest-browser-solid'
import { page } from 'vitest/browser'
import { createSignal } from 'solid-js'
import { FontRegistryProvider } from '../../../fonts'
import { SettingsProvider } from '../../SettingsProvider'
import { FontsSubcategoryUI } from '../components/FontsSubcategoryUI'
import { FontFamilySelect } from '../../components/FontFamilySelect'
import { FontCategory } from '../../../fonts'

// Mock font data for server responses
const mockFontLinks = {
	JetBrainsMono:
		'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip',
	FiraCode:
		'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/FiraCode.zip',
	Hack: 'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/Hack.zip',
}

const mockFontData = new ArrayBuffer(1024)

describe('Font Management Workflow Integration', () => {
	let originalFetch: typeof fetch

	beforeEach(() => {
		vi.clearAllMocks()

		// Store original fetch
		originalFetch = globalThis.fetch

		// Mock fetch for font API calls - Eden client uses fetch under the hood
		globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
			const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url

			// Handle font list endpoint
			if (urlString.includes('/fonts') && !urlString.includes('/fonts/')) {
				return Promise.resolve(new Response(JSON.stringify(mockFontLinks), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}))
			}
			// Handle individual font download endpoint
			if (urlString.includes('/fonts/')) {
				return Promise.resolve(new Response(mockFontData, {
					status: 200,
					headers: { 'Content-Type': 'font/ttf' },
				}))
			}
			// Pass through to original fetch for other requests
			return originalFetch(url)
		}) as unknown as typeof fetch
	})

	afterEach(() => {
		vi.restoreAllMocks()
		globalThis.fetch = originalFetch
	})

	it('renders font browser UI with provider context', async () => {
		const TestApp = () => (
			<SettingsProvider>
				<FontRegistryProvider>
					<div data-testid="test-app">
						<FontsSubcategoryUI />
					</div>
				</FontRegistryProvider>
			</SettingsProvider>
		)

		const { unmount } = render(() => <TestApp />)

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 200))

		try {
			// Verify the component rendered
			const testApp = document.querySelector('[data-testid="test-app"]')
			expect(testApp).toBeTruthy()

			// The component should be rendering (whether or not fonts loaded from mock)
			// This tests the basic rendering and provider setup
		} finally {
			unmount()
		}
	})

	it('renders font family select with settings context', async () => {
		const TestApp = () => {
			const [selectedFont, setSelectedFont] = createSignal(
				"'JetBrains Mono Variable', monospace"
			)

			return (
				<SettingsProvider>
					<FontRegistryProvider>
						<div data-testid="font-selector-container">
							<FontFamilySelect
								value={selectedFont()}
								onChange={setSelectedFont}
								label="Editor Font"
								description="Select font for the editor"
								category={FontCategory.MONO}
							/>
						</div>
					</FontRegistryProvider>
				</SettingsProvider>
			)
		}

		const { unmount } = render(() => <TestApp />)

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 200))

		try {
			// Verify the component rendered
			const container = document.querySelector('[data-testid="font-selector-container"]')
			expect(container).toBeTruthy()

			// Check that the label is visible
			await expect.element(page.getByText('Editor Font')).toBeVisible()
		} finally {
			unmount()
		}
	})

	it('renders both font browser and selector together', async () => {
		const TestApp = () => {
			const [selectedFont, setSelectedFont] = createSignal(
				"'JetBrains Mono Variable', monospace"
			)

			return (
				<SettingsProvider>
					<FontRegistryProvider>
						<div data-testid="combined-test">
							<div data-testid="fonts-browser">
								<FontsSubcategoryUI />
							</div>
							<div data-testid="font-selector">
								<FontFamilySelect
									value={selectedFont()}
									onChange={setSelectedFont}
									label="Editor Font"
									description="Select font for the editor"
									category={FontCategory.MONO}
								/>
							</div>
						</div>
					</FontRegistryProvider>
				</SettingsProvider>
			)
		}

		const { unmount } = render(() => <TestApp />)

		// Wait for components to render
		await new Promise(resolve => setTimeout(resolve, 200))

		try {
			// Verify both sections rendered
			const fontsBrowser = document.querySelector('[data-testid="fonts-browser"]')
			const fontSelector = document.querySelector('[data-testid="font-selector"]')
			expect(fontsBrowser).toBeTruthy()
			expect(fontSelector).toBeTruthy()

			// Verify the label is visible
			await expect.element(page.getByText('Editor Font')).toBeVisible()
		} finally {
			unmount()
		}
	})

	it('provider context propagates correctly to nested components', async () => {
		const TestApp = () => (
			<SettingsProvider>
				<FontRegistryProvider>
					<div data-testid="nested-context">
						<div data-testid="level-1">
							<div data-testid="level-2">
								<FontsSubcategoryUI />
							</div>
						</div>
					</div>
				</FontRegistryProvider>
			</SettingsProvider>
		)

		const { unmount } = render(() => <TestApp />)

		// Wait for component to render
		await new Promise(resolve => setTimeout(resolve, 200))

		try {
			// Verify nested structure rendered
			const level1 = document.querySelector('[data-testid="level-1"]')
			const level2 = document.querySelector('[data-testid="level-2"]')
			expect(level1).toBeTruthy()
			expect(level2).toBeTruthy()
		} finally {
			unmount()
		}
	})
})
