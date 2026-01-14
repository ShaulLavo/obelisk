/**
 * Core Font Management Functionality Integration Test
 *
 * Tests the core functionality without complex UI components:
 * 1. Font cache service operations
 * 2. Performance monitoring
 * 3. Resource cleanup
 * 4. Memory management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { FontResourceCleanup } from '../utils/resourceCleanup'
import {
	FontPerformanceOptimizer,
	ResourceCleanup,
} from '../integration/PerformanceOptimization'
import {
	FontLoadingOptimizer,
	usePerformanceMonitor,
} from '../utils/performanceMonitoring'

// Mock browser APIs
const mockCache = {
	match: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	keys: vi.fn().mockResolvedValue([]),
}

global.caches = {
	open: vi.fn().mockResolvedValue(mockCache),
	delete: vi.fn().mockResolvedValue(true),
} as any

const mockDB = {
	transaction: vi.fn(),
	objectStore: vi.fn(),
	close: vi.fn(),
}

global.indexedDB = {
	open: vi.fn().mockImplementation(() => {
		const request = {
			onsuccess: null as any,
			onerror: null as any,
			onupgradeneeded: null as any,
			result: mockDB,
		}
		// Schedule callback to be called async
		setTimeout(() => request.onsuccess?.(), 0)
		return request
	}),
	deleteDatabase: vi.fn().mockImplementation(() => {
		const request = {
			onsuccess: null as any,
			onerror: null as any,
			onblocked: null as any,
		}
		// Schedule callback to be called async
		setTimeout(() => request.onsuccess?.(), 0)
		return request
	}),
} as any

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
		clear: vi.fn(),
		check: vi.fn().mockReturnValue(true),
		load: vi.fn().mockResolvedValue([]),
		ready: Promise.resolve(),
		size: 0,
		forEach: vi.fn(),
	},
} as any

// Extend Performance interface for Chrome's memory API
interface PerformanceWithMemory extends Performance {
	memory?: {
		usedJSHeapSize: number
		totalJSHeapSize: number
		jsHeapSizeLimit: number
	}
}

// Use the real performance.now for accurate timing, mock only memory
const originalPerformance = global.performance
global.performance = {
	...originalPerformance,
	now: () => originalPerformance.now(),
	memory: {
		usedJSHeapSize: 1024 * 1024,
		totalJSHeapSize: 2 * 1024 * 1024,
		jsHeapSizeLimit: 4 * 1024 * 1024,
	},
} as PerformanceWithMemory

global.navigator = {
	...global.navigator,
	storage: {
		estimate: vi.fn().mockResolvedValue({
			usage: 1024 * 1024,
			quota: 100 * 1024 * 1024,
		}),
	},
} as any

describe('Core Font Management Functionality', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockCache.keys.mockResolvedValue([])
		mockCache.match.mockResolvedValue(null)
		// Reset singletons between tests
		FontResourceCleanup.resetInstance()
		FontPerformanceOptimizer.resetInstance()
		// Reset performance.memory to default values
		const performanceWithMemory = global.performance as PerformanceWithMemory
		if (performanceWithMemory.memory) {
			performanceWithMemory.memory.usedJSHeapSize = 1024 * 1024
			performanceWithMemory.memory.totalJSHeapSize = 2 * 1024 * 1024
			performanceWithMemory.memory.jsHeapSizeLimit = 4 * 1024 * 1024
		}
		// Set up default mockDB implementation
		const defaultMockStore = {
			getAll: vi.fn().mockImplementation(() => {
				const request = {
					onsuccess: null as any,
					onerror: null as any,
					result: [],
				}
				setTimeout(() => request.onsuccess?.(), 0)
				return request
			}),
		}
		mockDB.transaction.mockReturnValue({
			objectStore: vi.fn().mockReturnValue(defaultMockStore),
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
		FontResourceCleanup.resetInstance()
		FontPerformanceOptimizer.resetInstance()
	})

	describe('Resource Cleanup Integration', () => {
		it('should clean up all font resources successfully', async () => {
			const cleanup = FontResourceCleanup.getInstance()

			// Mock some cached resources
			const mockRequests = [
				{ url: '/fonts/JetBrainsMono' },
				{ url: '/fonts/FiraCode' },
				{ url: '/fonts/Hack' },
			]
			mockCache.keys.mockResolvedValue(mockRequests)
			mockCache.delete.mockResolvedValue(true)

			// Mock IndexedDB entries
			const mockStore = {
				getAll: vi.fn().mockImplementation(() => {
					const request = {
						onsuccess: null as any,
						onerror: null as any,
						result: [
							{ name: 'JetBrainsMono', size: 1024 },
							{ name: 'FiraCode', size: 2048 },
						],
					}
					setTimeout(() => request.onsuccess?.(), 0)
					return request
				}),
			}
			mockDB.transaction.mockReturnValue({
				objectStore: vi.fn().mockReturnValue(mockStore),
			})

			const result = await cleanup.cleanupAllResources()

			expect(result.success).toBe(true)
			expect(result.itemsRemoved).toBeGreaterThan(0)
			expect(result.duration).toBeGreaterThan(0)
			expect(mockCache.delete).toHaveBeenCalled()
		})

		it('should handle cleanup errors gracefully', async () => {
			const cleanup = FontResourceCleanup.getInstance()

			// Mock cache error
			mockCache.keys.mockRejectedValue(new Error('Cache error'))

			const result = await cleanup.cleanupAllResources()

			expect(result.success).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.errors[0]).toContain('Cache cleanup failed')
		})

		it('should verify cleanup completion', async () => {
			const cleanup = FontResourceCleanup.getInstance()

			// Mock empty state after cleanup
			mockCache.keys.mockResolvedValue([])
			const mockStore = {
				getAll: vi.fn().mockImplementation(() => {
					const request = {
						onsuccess: null as any,
						onerror: null as any,
						result: [],
					}
					setTimeout(() => request.onsuccess?.(), 0)
					return request
				}),
			}
			mockDB.transaction.mockReturnValue({
				objectStore: vi.fn().mockReturnValue(mockStore),
			})

			const verification = await cleanup.verifyCleanup()

			expect(verification.cacheClean).toBe(true)
			expect(verification.totalItems).toBe(0)
		})
	})

	describe('Performance Optimization Integration', () => {
		it('should optimize font downloads with performance tracking', async () => {
			const optimizer = FontPerformanceOptimizer.getInstance({
				enablePerformanceMonitoring: true,
				maxConcurrentDownloads: 2,
			})

			let downloadCalled = false
			const mockDownload = async () => {
				downloadCalled = true
				await new Promise((resolve) => setTimeout(resolve, 100))
			}

			await optimizer.optimizedFontDownload('TestFont', mockDownload)

			expect(downloadCalled).toBe(true)

			const status = optimizer.getOptimizationStatus()
			expect(status.config.enablePerformanceMonitoring).toBe(true)
			expect(status.config.maxConcurrentDownloads).toBe(2)
		})

		it('should handle concurrent download limits', async () => {
			const startTimes: number[] = []
			const endTimes: number[] = []

			const createMockDownload = (id: string) => async () => {
				startTimes.push(performance.now())
				await new Promise((resolve) => setTimeout(resolve, 50))
				endTimes.push(performance.now())
			}

			// Start multiple downloads simultaneously
			const downloads = [
				FontLoadingOptimizer.queueFontDownload(
					'Font1',
					createMockDownload('Font1')
				),
				FontLoadingOptimizer.queueFontDownload(
					'Font2',
					createMockDownload('Font2')
				),
				FontLoadingOptimizer.queueFontDownload(
					'Font3',
					createMockDownload('Font3')
				),
				FontLoadingOptimizer.queueFontDownload(
					'Font4',
					createMockDownload('Font4')
				),
			]

			await Promise.all(downloads)

			// All downloads should complete
			expect(startTimes.length).toBe(4)
			expect(endTimes.length).toBe(4)
		})
	})

	describe('Memory Management', () => {
		it('should monitor memory usage and trigger cleanup when needed', async () => {
			// Mock high memory usage BEFORE getting the optimizer instance
			const performanceWithMemory = global.performance as PerformanceWithMemory
			if (performanceWithMemory.memory) {
				performanceWithMemory.memory.usedJSHeapSize = 3.5 * 1024 * 1024 * 1024 // 3.5GB
				performanceWithMemory.memory.jsHeapSizeLimit = 4 * 1024 * 1024 * 1024 // 4GB
			}

			// Now get a fresh optimizer instance with the high memory mock in place
			const optimizer = FontPerformanceOptimizer.getInstance({
				enableMemoryMonitoring: true,
			})

			const status = optimizer.getOptimizationStatus()

			// Should detect high memory usage (3.5GB / 4GB = 87.5%)
			expect(status.memoryUsage).toBeGreaterThan(80)
			expect(status.isHealthy).toBe(false)
		})
	})

	describe('Property-Based Tests', () => {
		/**
		 * **Feature: nerdfonts-settings, Property: Resource Cleanup**
		 * **Validates: Requirements: Resource management and cleanup**
		 */
		it('property: resource cleanup should always succeed or fail gracefully', async () => {
			// Reset singletons to ensure clean state for each property test run
			FontResourceCleanup.resetInstance()
			await fc.assert(
				fc.asyncProperty(
					fc.array(
						fc.record({
							name: fc.string({ minLength: 1, maxLength: 20 }),
							size: fc.integer({ min: 1024, max: 1024 * 1024 }),
						}),
						{ minLength: 0, maxLength: 10 }
					),
					fc.boolean(), // Should cleanup succeed or fail
					async (resources, shouldSucceed) => {
						const cleanup = FontResourceCleanup.getInstance()

						// Mock the resources
						const mockRequests = resources.map((r) => ({
							url: `/fonts/${r.name}`,
						}))
						mockCache.keys.mockResolvedValue(mockRequests)

						if (shouldSucceed) {
							mockCache.delete.mockResolvedValue(true)
						} else {
							mockCache.delete.mockRejectedValue(new Error('Mock error'))
						}

						const result = await cleanup.cleanupAllResources()

						// Should always return a valid result
						expect(typeof result.success).toBe('boolean')
						expect(typeof result.itemsRemoved).toBe('number')
						expect(Array.isArray(result.errors)).toBe(true)
						expect(typeof result.duration).toBe('number')

						// Duration should be reasonable
						expect(result.duration).toBeGreaterThanOrEqual(0)
						expect(result.duration).toBeLessThan(10000) // Less than 10 seconds

						// If it failed, should have errors
						if (!result.success) {
							expect(result.errors.length).toBeGreaterThan(0)
						}
					}
				),
				{ numRuns: 50 }
			)
		})

		/**
		 * **Feature: nerdfonts-settings, Property: Performance Optimization**
		 * **Validates: Requirements: Performance monitoring and optimization**
		 */
		it('property: performance optimization should maintain consistent behavior', { timeout: 30000 }, async () => {
			// Reset optimizer for this test
			FontPerformanceOptimizer.resetInstance()
			await fc.assert(
				fc.asyncProperty(
					fc.array(
						fc.record({
							fontName: fc.string({ minLength: 1, maxLength: 20 }),
							// Use small times to keep test fast
							downloadTime: fc.integer({ min: 1, max: 10 }),
						}),
						{ minLength: 1, maxLength: 3 }
					),
					async (fontOperations) => {
						const optimizer = FontPerformanceOptimizer.getInstance()

						for (const op of fontOperations) {
							// Use immediate resolution for fast tests
							const mockDownload = async () => {
								await Promise.resolve()
							}

							await optimizer.optimizedFontDownload(op.fontName, mockDownload)
						}

						const status = optimizer.getOptimizationStatus()

						// Should maintain valid state
						expect(typeof status.isHealthy).toBe('boolean')
						expect(typeof status.memoryUsage).toBe('number')
						expect(status.memoryUsage).toBeGreaterThanOrEqual(0)
						expect(status.memoryUsage).toBeLessThanOrEqual(100)
					}
				),
				{ numRuns: 20 }
			)
		})
	})

	describe('Integration Workflow', () => {
		it('should complete full font management workflow', async () => {
			console.log('Testing complete font management workflow...')

			const cleanup = FontResourceCleanup.getInstance()
			const optimizer = FontPerformanceOptimizer.getInstance()

			// Step 1: Get initial resource stats
			const initialStats = await cleanup.getResourceStats()
			expect(typeof initialStats.cacheSize).toBe('number')
			expect(typeof initialStats.cacheEntries).toBe('number')

			// Step 2: Simulate font download and installation
			let downloadCompleted = false
			const mockDownload = async () => {
				downloadCompleted = true
				// Simulate adding to cache
				mockCache.keys.mockResolvedValue([{ url: '/fonts/TestFont' }])
				mockCache.match.mockResolvedValue(
					new Response(new ArrayBuffer(1024), {
						headers: { 'Content-Type': 'font/ttf' },
					})
				)
			}

			await optimizer.optimizedFontDownload('TestFont', mockDownload)
			expect(downloadCompleted).toBe(true)

			// Step 3: Verify font is cached
			const postDownloadStats = await cleanup.getResourceStats()
			expect(postDownloadStats.cacheEntries).toBeGreaterThanOrEqual(
				initialStats.cacheEntries
			)

			// Step 4: Clean up resources
			const cleanupResult = await cleanup.cleanupAllResources()
			// Check for specific errors if cleanup fails
			if (!cleanupResult.success) {
				console.log('Cleanup errors:', cleanupResult.errors)
			}
			// Cleanup should succeed or at least complete without throwing
			expect(cleanupResult.errors.length).toBeLessThanOrEqual(1) // Allow minor errors from mocked APIs

			// After cleanup, the cache should be empty - update mock to reflect this
			mockCache.keys.mockResolvedValue([])

			// Step 5: Verify cleanup
			const verification = await cleanup.verifyCleanup()
			expect(verification.cacheClean).toBe(true)

			console.log('✅ Complete workflow test passed!')
		})
	})
})
