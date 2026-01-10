import { createStore } from 'solid-js/store'
import { createResource, useTransition, batch } from 'solid-js'
import { client } from '~/client'
import { fontCacheService, fontInstallationService } from '../services'
import { RetryService } from '../services/RetryService'

export type FontInfo = {
	name: string
	displayName: string
	isInstalled: boolean
	isDownloading: boolean
	downloadProgress?: number
	installedAt?: Date
	size?: number
}

export type FontStoreState = {
	downloadQueue: Set<string>
	cacheStats: {
		totalSize: number
		fontCount: number
		lastCleanup: Date
	}
}

export type FontActions = {
	downloadFont: (name: string) => Promise<void>
	downloadMultipleFonts: (names: string[]) => Promise<void>
	removeFont: (name: string) => Promise<void>
	isFontInstalled: (name: string) => boolean
	getCacheStats: () => Promise<{ totalSize: number; fontCount: number }>
	cleanupCache: () => Promise<void>
	refreshAvailableFonts: () => Promise<void>
	refreshInstalledFonts: () => Promise<void>
}

export type FontStore = {
	state: FontStoreState
	availableFonts: () => Record<string, string> | undefined
	installedFonts: () => Set<string> | undefined
	cacheStats: () => { totalSize: number; fontCount: number } | undefined
	pending: () => boolean
	startTransition: (fn: () => void) => void
	actions: FontActions
}

export const createFontStore = (): FontStore => {
	const [state, setState] = createStore<FontStoreState>({
		downloadQueue: new Set(),
		cacheStats: {
			totalSize: 0,
			fontCount: 0,
			lastCleanup: new Date(),
		},
	})

	const [availableFonts, { refetch: refetchAvailableFonts }] = createResource(
		async () => {
			const result = await RetryService.retryServerCall(async () => {
				const response = await client.fonts.get()
				if (response.data) {
					return response.data
				}
				throw new Error('Failed to fetch available fonts')
			}, '/fonts')

			if (!result.success) {
				throw (
					result.error ||
					new Error('Failed to fetch available fonts after retries')
				)
			}

			return result.result!
		}
	)

	const [installedFonts, { refetch: refetchInstalledFonts }] = createResource(
		async () => {
			const result = await RetryService.retryCacheOperation(async () => {
				await fontCacheService.init()
				await fontInstallationService.initialize()

				const cachedFonts = await fontCacheService.getInstalledFonts()
				const installedInDocument = fontInstallationService.getInstalledFonts()

				const installedFonts = new Set<string>()
				for (const fontName of cachedFonts) {
					if (installedInDocument.has(fontName)) {
						installedFonts.add(fontName)
					}
				}

				return installedFonts
			}, 'installed fonts retrieval')

			if (result.success) {
				return result.result!
			} else {
				console.warn(
					'[FontStore] Failed to get installed fonts:',
					result.error?.message
				)
				return new Set<string>()
			}
		}
	)

	const [cacheStats, { refetch: refetchCacheStats }] = createResource(
		async () => {
			const result = await RetryService.retryCacheOperation(async () => {
				await fontCacheService.init()
				return await fontCacheService.getCacheStats()
			}, 'cache stats retrieval')

			if (result.success) {
				return result.result!
			} else {
				console.warn(
					'[FontStore] Failed to get cache stats:',
					result.error?.message
				)
				return { totalSize: 0, fontCount: 0 }
			}
		}
	)

	const [pending, startTransition] = useTransition()

	const downloadFont = async (name: string): Promise<void> => {
		setState('downloadQueue', (queue) => new Set([...Array.from(queue), name]))

		try {
			const available = availableFonts()
			if (!available || !available[name]) {
				throw new Error(`Font ${name} not found in available fonts`)
			}

			const { fontDownloadService } =
				await import('../services/FontDownloadService')

			await fontDownloadService.downloadAndInstallFont(name, available[name])

			batch(() => {
				refetchInstalledFonts()
				refetchCacheStats()
			})
		} finally {
			setState('downloadQueue', (queue) => {
				const newQueue = new Set(queue)
				newQueue.delete(name)
				return newQueue
			})
		}
	}

	const downloadMultipleFonts = async (names: string[]): Promise<void> => {
		// Add all to queue
		setState('downloadQueue', (queue) => new Set([...queue, ...names]))

		try {
			// Call batch API
			const response = await client.fonts.batch.post({ names })

			if (!response.data) {
				throw new Error('No data received from batch download')
			}

			// Process each font result
			const { fontCacheService } = await import('../services/FontCacheService')
			const { fontInstallationService } =
				await import('../services/FontInstallationService')

			// Initialize services
			await fontCacheService.init()
			await fontInstallationService.initialize()

			const updates: Promise<void>[] = []

			for (const [name, base64Data] of Object.entries(response.data)) {
				if (base64Data) {
					// Decode and cache
					const binaryString = atob(base64Data)
					const bytes = new Uint8Array(binaryString.length)
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i)
					}

					updates.push(
						(async () => {
							try {
								await fontCacheService.storeFont(name, bytes.buffer)
								await fontInstallationService.installFont(name)
							} catch (e) {
								console.error(`Failed to install ${name}`, e)
							}
						})()
					)
				}
			}
			await Promise.all(updates)

			batch(() => {
				refetchInstalledFonts()
				refetchCacheStats()
			})
		} catch (error) {
			console.error('[FontStore] Batch download failed:', error)
		} finally {
			setState('downloadQueue', (queue) => {
				const newQueue = new Set(queue)
				names.forEach((name) => newQueue.delete(name))
				return newQueue
			})
		}
	}

	const removeFont = async (name: string): Promise<void> => {
		await fontCacheService.init()

		await fontCacheService.removeFont(name)
		await fontInstallationService.uninstallFont(name)

		batch(() => {
			refetchInstalledFonts()
			refetchCacheStats()
		})
	}

	const isFontInstalled = (name: string): boolean => {
		const installed = installedFonts()
		return installed ? installed.has(name) : false
	}

	const getCacheStatsAction = async (): Promise<{
		totalSize: number
		fontCount: number
	}> => {
		try {
			await fontCacheService.init()
			return await fontCacheService.getCacheStats()
		} catch {
			return { totalSize: 0, fontCount: 0 }
		}
	}

	const cleanupCache = async (): Promise<void> => {
		await fontCacheService.init()
		await fontCacheService.cleanupCache()
		refetchCacheStats()
	}

	const refreshAvailableFonts = async (): Promise<void> => {
		refetchAvailableFonts()
	}

	const refreshInstalledFonts = async (): Promise<void> => {
		refetchInstalledFonts()
	}

	const actions: FontActions = {
		downloadFont,
		downloadMultipleFonts,
		removeFont,
		isFontInstalled,
		getCacheStats: getCacheStatsAction,
		cleanupCache,
		refreshAvailableFonts,
		refreshInstalledFonts,
	}

	return {
		state,
		availableFonts,
		installedFonts,
		cacheStats,
		pending,
		startTransition,
		actions,
	}
}
