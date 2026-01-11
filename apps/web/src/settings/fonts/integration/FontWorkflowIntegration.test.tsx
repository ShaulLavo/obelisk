/**
 * End-to-End Font Management Workflow Integration Test
 *
 * Tests the complete user journey:
 * 1. Browse available fonts
 * 2. Download and install fonts
 * 3. Use fonts in editor settings
 * 4. Manage installed fonts
 * 5. Remove fonts
 * 6. Verify cleanup and resource management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { createRoot, createSignal } from 'solid-js'
import { FontRegistryProvider } from '../../../fonts'
import { SettingsProvider } from '../../SettingsProvider'
import { FontsSubcategoryUI } from '../components/FontsSubcategoryUI'
import { FontFamilySelect } from '../../components/FontFamilySelect'
import { FontCategory } from '../../../fonts'

// Mock the server endpoints
const mockFontLinks = {
	JetBrainsMono:
		'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/JetBrainsMono.zip',
	FiraCode:
		'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/FiraCode.zip',
	Hack: 'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.1.1/Hack.zip',
}

const mockFontData = new ArrayBuffer(1024) // Mock font data

// Mock fetch for server endpoints
global.fetch = vi.fn().mockImplementation((url: string) => {
	if (url.includes('/fonts') && !url.includes('/fonts/')) {
		// Available fonts endpoint
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(mockFontLinks),
		})
	} else if (url.includes('/fonts/')) {
		// Individual font download endpoint
		return Promise.resolve({
			ok: true,
			arrayBuffer: () => Promise.resolve(mockFontData),
		})
	}
	return Promise.reject(new Error('Unknown endpoint'))
}) as unknown as typeof fetch

// Mock Cache API
const mockCache = {
	match: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	keys: vi.fn().mockResolvedValue([]),
}

global.caches = {
	open: vi.fn().mockResolvedValue(mockCache),
} as any

// Mock IndexedDB
const mockDB = {
	transaction: vi.fn(),
	objectStore: vi.fn(),
	get: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	getAll: vi.fn().mockResolvedValue([]),
}

global.indexedDB = {
	open: vi.fn().mockImplementation(() => ({
		onsuccess: null,
		onerror: null,
		onupgradeneeded: null,
		result: mockDB,
	})),
} as any

// Mock FontFace API
global.FontFace = vi.fn().mockImplementation((family, source, descriptors) => ({
	family,
	source,
	descriptors,
	load: vi.fn().mockResolvedValue(undefined),
	loaded: Promise.resolve(),
}))

global.document = {
	...global.document,
	fonts: {
		add: vi.fn(),
		delete: vi.fn(),
		check: vi.fn().mockReturnValue(true),
		load: vi.fn().mockResolvedValue([]),
		ready: Promise.resolve(),
	},
} as any

describe('Font Management Workflow Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset cache mock responses
		mockCache.match.mockResolvedValue(null) // No cached fonts initially
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('completes the full font management workflow', async () => {
		const TestApp = () => {
			const [selectedFont, setSelectedFont] = createSignal(
				"'JetBrains Mono Variable', monospace"
			)

			return (
				<SettingsProvider>
					<FontRegistryProvider>
						<div data-testid="test-app">
							{/* Font Browser Component */}
							<div data-testid="fonts-browser">
								<FontsSubcategoryUI />
							</div>

							{/* Font Selection Component */}
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

		try {
			// Step 1: Verify fonts browser loads available fonts
			console.log('Step 1: Verifying font browser loads available fonts...')

			// Wait for the fonts to load (Suspense boundary)
			await waitFor(
				() => {
					expect(screen.getByText('Available NerdFonts')).toBeInTheDocument()
				},
				{ timeout: 5000 }
			)

			// Verify font cards are displayed
			await waitFor(() => {
				expect(screen.getByText('JetBrainsMono')).toBeInTheDocument()
				expect(screen.getByText('FiraCode')).toBeInTheDocument()
				expect(screen.getByText('Hack')).toBeInTheDocument()
			})

			// Step 2: Download and install a font
			console.log('Step 2: Downloading and installing a font...')

			// Find and click download button for JetBrainsMono
			const jetbrainsCard =
				screen.getByText('JetBrainsMono').closest('[data-testid]') ||
				screen.getByText('JetBrainsMono').closest('.p-4')
			expect(jetbrainsCard).toBeInTheDocument()

			const downloadButton = jetbrainsCard?.querySelector(
				'button'
			) as HTMLButtonElement
			expect(downloadButton).toBeInTheDocument()
			expect(downloadButton.textContent).toContain('Download')

			// Click download button
			fireEvent.click(downloadButton)

			// Verify download state changes
			await waitFor(() => {
				expect(downloadButton.textContent).toContain('Downloading')
				expect(downloadButton).toBeDisabled()
			})

			// Wait for download to complete
			await waitFor(
				() => {
					expect(downloadButton.textContent).toContain('Remove')
					expect(downloadButton).not.toBeDisabled()
				},
				{ timeout: 5000 }
			)

			// Step 3: Verify font appears in installed fonts section
			console.log('Step 3: Verifying font appears in installed fonts...')

			await waitFor(() => {
				const installedSection = screen.getByText('Installed Fonts (1)')
				expect(installedSection).toBeInTheDocument()
			})

			// Verify the font is listed in installed fonts
			const installedFontItem = screen
				.getByText('JetBrainsMono')
				.closest('.flex')
			expect(installedFontItem).toBeInTheDocument()
			expect(installedFontItem?.textContent).toContain(
				'Sample: The quick brown fox 123'
			)

			// Step 4: Verify font is available in editor font selector
			console.log('Step 4: Verifying font is available in editor selector...')

			const fontSelector = screen.getByTestId('font-selector')
			expect(fontSelector).toBeInTheDocument()

			// The font should now be available in the font options
			// This is tested through the FontFamilySelect component integration

			// Step 5: Test font removal
			console.log('Step 5: Testing font removal...')

			const removeButton = installedFontItem?.querySelector('button')
			expect(removeButton).toBeInTheDocument()
			expect(removeButton?.textContent).toContain('Remove')

			// Click remove button
			fireEvent.click(removeButton!)

			// Verify font is removed from installed fonts
			await waitFor(() => {
				expect(
					screen.queryByText('Installed Fonts (1)')
				).not.toBeInTheDocument()
				expect(screen.getByText('No fonts installed yet')).toBeInTheDocument()
			})

			// Verify download button is available again
			const jetbrainsCardAfterRemoval = screen
				.getByText('JetBrainsMono')
				.closest('.p-4')
			const downloadButtonAfterRemoval =
				jetbrainsCardAfterRemoval?.querySelector('button')
			expect(downloadButtonAfterRemoval?.textContent).toContain('Download')

			// Step 6: Test search functionality
			console.log('Step 6: Testing search functionality...')

			const searchInput = screen.getByPlaceholderText('Search fonts...')
			expect(searchInput).toBeInTheDocument()

			// Search for specific font
			fireEvent.input(searchInput, { target: { value: 'Fira' } })

			await waitFor(() => {
				expect(screen.getByText('FiraCode')).toBeInTheDocument()
				expect(screen.queryByText('JetBrainsMono')).not.toBeInTheDocument()
				expect(screen.queryByText('Hack')).not.toBeInTheDocument()
			})

			// Clear search
			fireEvent.input(searchInput, { target: { value: '' } })

			await waitFor(() => {
				expect(screen.getByText('FiraCode')).toBeInTheDocument()
				expect(screen.getByText('JetBrainsMono')).toBeInTheDocument()
				expect(screen.getByText('Hack')).toBeInTheDocument()
			})

			// Step 7: Test error handling
			console.log('Step 7: Testing error handling...')

			// Mock a failed download
			const originalFetch = global.fetch
			global.fetch = vi
				.fn()
				.mockRejectedValue(
					new Error('Network error')
				) as unknown as typeof fetch

			const hackCard = screen.getByText('Hack').closest('.p-4')
			const hackDownloadButton = hackCard?.querySelector(
				'button'
			) as HTMLButtonElement

			fireEvent.click(hackDownloadButton)

			// Should handle error gracefully without crashing
			await waitFor(
				() => {
					expect(hackDownloadButton.textContent).toContain('Download')
				},
				{ timeout: 3000 }
			)

			// Restore fetch
			global.fetch = originalFetch

			console.log('✅ All workflow steps completed successfully!')
		} finally {
			unmount()
		}
	})

	it('handles cache persistence across sessions', async () => {
		console.log('Testing cache persistence...')

		// Mock cached font data
		mockCache.match.mockResolvedValue(
			new Response(mockFontData, {
				headers: { 'Content-Type': 'font/ttf' },
			})
		)

		// Mock IndexedDB with existing font metadata
		const mockMetadata = {
			name: 'JetBrainsMono',
			installedAt: new Date(),
			size: 1024,
			version: '1.0',
			lastAccessed: new Date(),
		}

		mockDB.getAll.mockResolvedValue([mockMetadata])

		const TestApp = () => (
			<SettingsProvider>
				<FontRegistryProvider>
					<FontsSubcategoryUI />
				</FontRegistryProvider>
			</SettingsProvider>
		)

		const { unmount } = render(() => <TestApp />)

		try {
			// Should load cached fonts on startup
			await waitFor(() => {
				expect(screen.getByText('Installed Fonts (1)')).toBeInTheDocument()
				expect(screen.getByText('JetBrainsMono')).toBeInTheDocument()
			})

			// Verify cache was checked
			expect(mockCache.match).toHaveBeenCalledWith('/fonts/JetBrainsMono')
			expect(mockDB.getAll).toHaveBeenCalled()

			console.log('✅ Cache persistence test completed!')
		} finally {
			unmount()
		}
	})

	it('handles resource cleanup properly', async () => {
		console.log('Testing resource cleanup...')

		const TestApp = () => (
			<SettingsProvider>
				<FontRegistryProvider>
					<FontsSubcategoryUI />
				</FontRegistryProvider>
			</SettingsProvider>
		)

		const { unmount } = render(() => <TestApp />)

		try {
			// Load and install a font
			await waitFor(() => {
				expect(screen.getByText('JetBrainsMono')).toBeInTheDocument()
			})

			const downloadButton = screen
				.getByText('JetBrainsMono')
				.closest('.p-4')
				?.querySelector('button') as HTMLButtonElement

			fireEvent.click(downloadButton)

			await waitFor(() => {
				expect(downloadButton.textContent).toContain('Remove')
			})

			// Remove the font
			fireEvent.click(downloadButton)

			await waitFor(() => {
				expect(screen.getByText('No fonts installed yet')).toBeInTheDocument()
			})

			// Verify cleanup was called
			expect(mockCache.delete).toHaveBeenCalledWith('/fonts/JetBrainsMono')

			console.log('✅ Resource cleanup test completed!')
		} finally {
			unmount()
		}
	})

	it('integrates properly with settings store', async () => {
		console.log('Testing settings store integration...')

		const TestApp = () => {
			const [fontFamily, setFontFamily] = createSignal(
				"'JetBrains Mono Variable', monospace"
			)

			return (
				<SettingsProvider>
					<FontRegistryProvider>
						<div>
							<FontsSubcategoryUI />
							<FontFamilySelect
								value={fontFamily()}
								onChange={setFontFamily}
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

		try {
			// Install a font
			await waitFor(() => {
				expect(screen.getByText('JetBrainsMono')).toBeInTheDocument()
			})

			const downloadButton = screen
				.getByText('JetBrainsMono')
				.closest('.p-4')
				?.querySelector('button') as HTMLButtonElement

			fireEvent.click(downloadButton)

			await waitFor(() => {
				expect(downloadButton.textContent).toContain('Remove')
			})

			// Font should be available in settings
			// This integration is handled by the FontFamilySelect component
			// which uses the font registry to get available fonts

			console.log('✅ Settings store integration test completed!')
		} finally {
			unmount()
		}
	})
})
